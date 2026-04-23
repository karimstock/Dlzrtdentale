const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

// Multer config for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg|gif|avif|mp4|mov|webm|m4v/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté'));
    }
  }
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.user = { id: payload.sub, email: payload.email };
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
  next();
}

// POST /api/media/upload
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

  const societeId = req.body.societe_id || req.headers['x-societe-id'];
  const analysisId = req.body.analysis_id || null;
  const file = req.file;

  try {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '') || 'bin';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload original to R2 (or fallback to local)
    let r2Url = null;
    try {
      const { R2Client } = require('../lib/r2-client');
      const r2 = new R2Client();
      const key = `imported/${societeId}/manual/originals/${filename}`;
      r2Url = await r2.upload(key, file.buffer, { contentType: file.mimetype });
    } catch (e) {
      // Fallback: save locally
      const fs = require('fs');
      const uploadDir = `/home/ubuntu/jadomi/uploads/imported/${societeId || 'unknown'}`;
      fs.mkdirSync(uploadDir, { recursive: true });
      const localPath = path.join(uploadDir, filename);
      fs.writeFileSync(localPath, file.buffer);
      r2Url = `/uploads/imported/${societeId || 'unknown'}/${filename}`;
    }

    // Extract basic metadata
    let metadata = {
      original_filename: file.originalname,
      mimetype: file.mimetype
    };

    if (isImage) {
      try {
        const sharp = require('sharp');
        const img = sharp(file.buffer);
        const meta = await img.metadata();
        metadata.width = meta.width;
        metadata.height = meta.height;
        metadata.format = meta.format;
        metadata.has_alpha = meta.hasAlpha;
      } catch (e) {}
    }

    // Create or find analysis
    let effectiveAnalysisId = analysisId;
    if (!effectiveAnalysisId && societeId) {
      // Create virtual analysis for manual uploads
      const { data } = await supabase
        .from('site_analyses')
        .insert({
          societe_id: societeId,
          source_url: null,
          status: 'done',
          status_message: 'Upload manuel'
        })
        .select()
        .single();
      effectiveAnalysisId = data?.id;
    }

    // Save to DB
    const { data: asset, error } = await supabase
      .from('imported_assets')
      .insert({
        analysis_id: effectiveAnalysisId,
        societe_id: societeId,
        asset_type: isImage ? 'image' : isVideo ? 'video' : 'document',
        source: 'manual_upload',
        original_r2_url: r2Url,
        r2_url: r2Url,
        original_size_bytes: file.size,
        metadata
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      asset_id: asset.id,
      r2_url: r2Url,
      original_r2_url: r2Url,
      type: asset.asset_type,
      metadata
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
