const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const FORMATION_FILE = path.join(__dirname, '..', 'public', 'formation', 'index.html');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'formation', 'images');
const ADMIN_EMAIL = 'karim_bahmed@yahoo.fr';

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return _sb;
}

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await sb().auth.getUser(token);
    if (error || !user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only' });
    next();
  } catch { return res.status(401).json({ error: 'Auth' }); }
}

// GET /api/formation/slides — liste toutes les slides
router.get('/slides', requireAdmin, (req, res) => {
  try {
    const html = fs.readFileSync(FORMATION_FILE, 'utf-8');
    const sections = [];
    const regex = /<section([^>]*)>([\s\S]*?)<\/section>/g;
    let match;
    let idx = 0;
    while ((match = regex.exec(html)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const img = (attrs.match(/slide-(\d+)\.jpg/) || [])[1] || null;
      const notes = (content.match(/<aside class="notes">([\s\S]*?)<\/aside>/) || [])[1] || '';
      const hasVideo = content.includes('<video');
      const hasImg = content.includes('<img');
      const title = (content.match(/font-weight:900[^>]*>(.*?)</) || [])[1] || '';
      const cleanTitle = title.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();
      sections.push({
        index: idx,
        type: img ? 'pptx' : 'html',
        slideImg: img,
        title: cleanTitle.substring(0, 60),
        hasVideo,
        hasImg: hasImg || !!img,
        notesPreview: notes.replace(/<[^>]+>/g, ' ').replace(/\\'/g, "'").substring(0, 100).trim(),
      });
      idx++;
    }
    res.json({ total: sections.length, slides: sections });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/formation/slide/:index — contenu complet d'une slide
router.get('/slide/:index', requireAdmin, (req, res) => {
  try {
    const html = fs.readFileSync(FORMATION_FILE, 'utf-8');
    const sections = html.match(/<section[\s\S]*?<\/section>/g) || [];
    const idx = parseInt(req.params.index);
    if (idx < 0 || idx >= sections.length) return res.status(404).json({ error: 'Slide not found' });
    res.json({ index: idx, html: sections[idx], total: sections.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/formation/slide/:index — modifier une slide
router.put('/slide/:index', requireAdmin, (req, res) => {
  try {
    const { html: newSlideHtml } = req.body;
    if (!newSlideHtml) return res.status(400).json({ error: 'html requis' });
    
    let fileHtml = fs.readFileSync(FORMATION_FILE, 'utf-8');
    const sections = fileHtml.match(/<section[\s\S]*?<\/section>/g) || [];
    const idx = parseInt(req.params.index);
    if (idx < 0 || idx >= sections.length) return res.status(404).json({ error: 'Slide not found' });
    
    // Backup
    const backup = FORMATION_FILE + '.bak-' + Date.now();
    fs.copyFileSync(FORMATION_FILE, backup);
    
    // Replace
    fileHtml = fileHtml.replace(sections[idx], newSlideHtml);
    fs.writeFileSync(FORMATION_FILE, fileHtml);
    
    console.log('[FORMATION-EDITOR] Slide', idx, 'updated by admin');
    res.json({ success: true, backup: path.basename(backup) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/formation/upload — upload image (admin auth)
const upload = multer({
  dest: IMAGES_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
});
router.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const name = Date.now() + '-' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = path.join(IMAGES_DIR, name);
  fs.renameSync(req.file.path, dest);
  console.log('[FORMATION-EDITOR] Image uploaded:', name);
  res.json({ success: true, path: 'images/' + name, name });
});

// POST /api/formation/upload-video — upload vidéo depuis téléphone (code secret)
const UPLOAD_CODE = 'jadomi2026';
const uploadVideo = multer({
  dest: IMAGES_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});
router.post('/upload-video', uploadVideo.single('file'), (req, res) => {
  const code = req.query.code || req.body.code || '';
  if (code !== UPLOAD_CODE) return res.status(403).json({ error: 'Code incorrect' });
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  const origName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const name = Date.now() + '-' + origName;
  const dest = path.join(IMAGES_DIR, name);
  fs.renameSync(req.file.path, dest);
  const sizeMB = (req.file.size / (1024 * 1024)).toFixed(1);
  console.log(`[FORMATION-UPLOAD] Video uploaded: ${name} (${sizeMB} MB)`);
  res.json({ success: true, path: 'images/' + name, name, size: sizeMB + ' MB' });
});

// GET /api/formation/images — liste les images
router.get('/images', requireAdmin, (req, res) => {
  try {
    const files = [];
    const scan = (dir, prefix) => {
      fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) scan(full, prefix + f + '/');
        else if (/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(f)) {
          files.push({ name: prefix + f, size: stat.size, modified: stat.mtime });
        }
      });
    };
    scan(IMAGES_DIR, '');
    res.json({ images: files.sort((a, b) => b.modified - a.modified).slice(0, 100) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
