// =============================================
// JADOMI — Module Mon site internet
// photos.js — Upload + analyse Claude Vision + auto-categorisation
// =============================================
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// Check if ffmpeg is available
var FFMPEG_PATH = null;
try {
  var ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  FFMPEG_PATH = ffmpegInstaller.path;
} catch (e) {
  // Try system ffmpeg
  try { require('child_process').execFileSync('ffmpeg', ['-version']); FFMPEG_PATH = 'ffmpeg'; } catch (e2) { /* no ffmpeg */ }
}
if (FFMPEG_PATH) console.log('[vitrines/photos] FFmpeg available:', FFMPEG_PATH);
else console.log('[vitrines/photos] FFmpeg NOT available — videos will not be compressed');
const { uploadToR2, getPresignedUrl, deleteFromR2 } = require('../../services/r2-storage');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isImage = /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname);
    const isVideo = /\.(mp4|webm|mov|quicktime)$/i.test(file.originalname);
    const okMime = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb((isImage || isVideo || okMime) ? null : new Error('Format non accepte'), isImage || isVideo || okMime);
  }
});

// Vocabulaire Vision par metier
const VISION_VOCAB = {
  'dentiste': 'Vocabulaire si pertinent : proprete irreprochable, scialytique, fauteuil, ergonomie praticien, serenite pour patient anxieux, lumiere sans ombre.',
  'prothesiste': 'Vocabulaire : geste artisanal, stratification, teintes degradees, patine des outils, precision du micrometre, polissage miroir, profondeur ceramique.',
  'avocat': 'Vocabulaire : sobriete, rigueur, lumiere naturelle sur les ouvrages, patine du bois, intimite preservee, reliure des codes. Eviter : moderne, dynamique, fun.'
};

// Descriptions discriminantes pour la classification
function buildCategoryDescriptions(profConfig) {
  if (!profConfig) return '';
  return profConfig.photo_categories
    .filter(function(c) { return c.media_type !== 'video'; })
    .map(function(c) {
      var hints = {
        'accueil': 'vue large de la reception ou hall d\'entree, comptoir d\'accueil, pas de fauteuil dentaire',
        'salle_attente': 'fauteuils/canapes pour patients, espace d\'attente, pas de materiel medical',
        'salle_soin': 'fauteuil dentaire visible, scialytique, instruments medicaux',
        'plateau_technique': 'zoom sur equipement specialise (cone beam, microscope, laser), pas de patient',
        'sterilisation': 'autoclave, surface metallique sterile, sachets de sterilisation',
        'cas_clinique': 'gros plan bouche, dents, sourire, travaux prothetiques poses ou modele',
        'equipe': 'plusieurs personnes en blouse ou tenue professionnelle',
        'portrait_praticien': 'portrait d\'UNE personne, plan rapproche, tenue professionnelle',
        'atelier': 'vue large de l\'atelier/laboratoire avec postes de travail',
        'machines_cfao': 'machines numeriques, fraiseuse, imprimante 3D',
        'couronnes_finies': 'pieces prothetiques finies sur fond neutre ou modele',
        'bridges': 'bridges prothetiques sur modele ou fond neutre',
        'etapes_conception': 'wax-up, biscuit ceramique, etapes intermediaires',
        'bureau_prive': 'bureau individuel, livres, dossiers',
        'salle_reunion': 'grande table, chaises, espace de reunion',
        'bibliotheque': 'etageres de livres juridiques, codes, ouvrages',
        'portrait': 'portrait professionnel d\'une personne',
        'vitrine_salon': 'devanture exterieure du salon ou boutique',
        'espace_coiffage': 'fauteuils de coiffure, miroirs, outils',
        'facade': 'vue exterieure du batiment/facade',
        'salle_principale': 'salle principale du restaurant, tables dressees',
        'plats_signatures': 'plats cuisines en presentation',
        'portrait_chef': 'portrait du chef en tenue'
      };
      return '- ' + c.id + ' : ' + (hints[c.id] || c.label);
    }).join('\n');
}

module.exports = function(router) {

  // ------------------------------------------
  // POST /photos/upload — Upload photo ou video
  // ------------------------------------------
  router.post('/photos/upload', requireSociete(), upload.single('photo'), async (req, res) => {
    try {
      var siteId = req.body.siteId;
      var category = req.body.category;
      if (!siteId || !category) return res.status(400).json({ error: 'siteId et category requis' });
      if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

      var isVideo = req.file.mimetype.startsWith('video/');
      var mediaType = isVideo ? 'video' : 'photo';
      if (!isVideo && req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Photo trop lourde (10 Mo max)' });
      }

      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('id', siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });
      var site = siteRes.data;

      var profConfig = getProfession(site.profession_id);
      if (profConfig) {
        var validCats = profConfig.photo_categories.map(function(c) { return c.id; });
        if (!validCats.includes(category)) {
          return res.status(400).json({ error: 'Categorie invalide : ' + category });
        }
      }

      // Hash for dedup (first 256KB)
      var fileHash = crypto.createHash('sha256').update(req.file.buffer.subarray(0, 256 * 1024)).digest('hex');

      // Check for duplicate
      try {
        var dupRes = await admin().from('vitrines_medias').select('id').eq('site_id', siteId).eq('file_hash', fileHash).maybeSingle();
        if (dupRes.data) {
          console.log('[vitrines/photos] Duplicate detected, skipping:', fileHash.substring(0, 12));
          return res.json({ success: true, duplicate: true, media: dupRes.data });
        }
      } catch (e) { /* file_hash column may not exist yet */ }

      var ext = req.file.originalname.split('.').pop().toLowerCase();
      var r2Result = await uploadToR2(req.file.buffer, { format: ext, contentType: req.file.mimetype, compress: false, encrypt: false });

      var countRes = await admin().from('vitrines_medias').select('id', { count: 'exact', head: true }).eq('site_id', siteId).eq('category', category);

      var insertData = {
        site_id: siteId,
        category: category,
        original_dragged_category: category,
        media_type: mediaType,
        storage_path: r2Result.key,
        file_hash: fileHash,
        position: countRes.count || 0,
        rgpd_validated: mediaType === 'video' ? true : false,
        auto_categorized: false
      };

      // Video: generate poster thumbnail in background if ffmpeg available
      if (mediaType === 'video' && FFMPEG_PATH) {
        try {
          var posterResult = await generateVideoPoster(req.file.buffer, ext);
          if (posterResult.posterBuffer) {
            var posterR2 = await uploadToR2(posterResult.posterBuffer, { format: 'jpg', contentType: 'image/jpeg', compress: false, encrypt: false });
            insertData.poster_url = posterR2.key;
          }
          if (posterResult.duration) insertData.video_duration = Math.round(posterResult.duration);
        } catch (posterErr) {
          console.warn('[vitrines/photos] Poster generation failed:', posterErr.message);
        }
      }

      var insertRes = await admin().from('vitrines_medias').insert(insertData).select('*').single();
      if (insertRes.error) throw insertRes.error;

      res.json({ success: true, media: insertRes.data });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /photos/:mediaId/analyze — Claude Vision classifieur + commentaire
  // ------------------------------------------
  router.post('/photos/:mediaId/analyze', requireSociete(), async (req, res) => {
    try {
      var mediaRes = await admin().from('vitrines_medias').select('*, vitrines_sites!inner(societe_id, profession_id)').eq('id', req.params.mediaId).maybeSingle();
      if (mediaRes.error) throw mediaRes.error;
      if (!mediaRes.data) return res.status(404).json({ error: 'Media introuvable' });
      var media = mediaRes.data;
      if (media.vitrines_sites.societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden_societe' });

      if (media.media_type === 'video') {
        return res.json({ success: true, media: media, analysis: null, comment: 'Analyse video non disponible.' });
      }

      var result = await analyzePhoto(media, media.vitrines_sites.profession_id);

      res.json({ success: true, media: result.media, analysis: result.analysis, comment: result.comment });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /photos/:siteId — Liste des photos d'un site
  // ------------------------------------------
  router.get('/photos/:siteId', requireSociete(), async (req, res) => {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var dataRes = await admin().from('vitrines_medias').select('*').eq('site_id', req.params.siteId).order('category').order('position');
      if (dataRes.error) throw dataRes.error;

      var medias = await Promise.all((dataRes.data || []).map(async function(m) {
        try { m.url = await getPresignedUrl(m.storage_path, 3600); } catch (e) { m.url = null; }
        return m;
      }));

      // Include profession photo_categories for the frontend
      var profConfig = getProfession(siteRes.data.profession_id);
      var categories = profConfig ? profConfig.photo_categories : [];

      res.json({ success: true, medias: medias, categories: categories });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /photos/bulk-update — Re-categoriser en masse
  // ------------------------------------------
  router.patch('/photos/bulk-update', requireSociete(), async (req, res) => {
    try {
      var siteId = req.body.siteId;
      var changes = req.body.changes;
      if (!siteId || !changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: 'siteId et changes[] requis' });
      }

      // Verifier acces au site
      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var updated = 0;
      var deleted = 0;

      for (var i = 0; i < changes.length; i++) {
        var ch = changes[i];
        if (!ch.photo_id) continue;

        // Verifier que la photo appartient au site
        var photoRes = await admin().from('vitrines_medias').select('id, storage_path').eq('id', ch.photo_id).eq('site_id', siteId).maybeSingle();
        if (!photoRes.data) continue;

        if (ch.delete) {
          try { await deleteFromR2(photoRes.data.storage_path); } catch (e) { /* ignore */ }
          await admin().from('vitrines_medias').delete().eq('id', ch.photo_id);
          deleted++;
        } else if (ch.category) {
          await admin().from('vitrines_medias').update({ category: ch.category, auto_categorized: false }).eq('id', ch.photo_id);
          updated++;
        }
      }

      res.json({ success: true, updated: updated, deleted: deleted });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /photos/reanalyze/:siteId — Lance l'analyse en arriere-plan, retourne job_id
  // ------------------------------------------
  router.post('/photos/reanalyze/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var dataRes = await admin().from('vitrines_medias').select('*').eq('site_id', req.params.siteId).eq('media_type', 'photo').eq('user_confirmed', false);
      if (dataRes.error) throw dataRes.error;
      var photos = dataRes.data || [];
      if (!photos.length) return res.json({ success: true, job_id: null, total: 0 });

      // Create job tracker
      var jobRes = await admin().from('vitrines_reanalyze_jobs').insert({ site_id: req.params.siteId, total: photos.length, completed: 0, status: 'running' }).select('*').single();
      if (jobRes.error) throw jobRes.error;
      var jobId = jobRes.data.id;
      var profId = siteRes.data.profession_id;

      // Respond immediately
      res.json({ success: true, job_id: jobId, total: photos.length });

      // Process in background (batches of 5)
      processPhotosBackground(photos, jobId, profId).catch(function(err) {
        console.error('[reanalyze bg]', err);
        admin().from('vitrines_reanalyze_jobs').update({ status: 'error' }).eq('id', jobId);
      });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /photos/reanalyze/status/:jobId — Poll job progress
  // ------------------------------------------
  router.get('/photos/reanalyze/status/:jobId', requireSociete(), async function(req, res) {
    try {
      var jobRes = await admin().from('vitrines_reanalyze_jobs').select('*').eq('id', req.params.jobId).maybeSingle();
      if (!jobRes.data) return res.status(404).json({ error: 'Job introuvable' });
      var j = jobRes.data;
      res.json({ success: true, status: j.status, completed: j.completed, total: j.total, progress_pct: Math.round((j.completed / Math.max(j.total, 1)) * 100) });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // DELETE /photos/:mediaId — Supprimer une photo
  // ------------------------------------------
  router.delete('/photos/:mediaId', requireSociete(), async (req, res) => {
    try {
      var mediaRes = await admin().from('vitrines_medias').select('*, vitrines_sites!inner(societe_id)').eq('id', req.params.mediaId).maybeSingle();
      if (!mediaRes.data) return res.status(404).json({ error: 'Media introuvable' });
      if (mediaRes.data.vitrines_sites.societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden_societe' });

      try { await deleteFromR2(mediaRes.data.storage_path); } catch (e) { console.warn('[vitrines/photos] R2 delete:', e.message); }
      var delRes = await admin().from('vitrines_medias').delete().eq('id', req.params.mediaId);
      if (delRes.error) throw delRes.error;

      res.json({ success: true });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /photos/:id — Update category + user confirmation
  // ------------------------------------------
  router.patch('/photos/:id', requireSociete(), async function(req, res) {
    try {
      var photoRes = await admin().from('vitrines_medias').select('id, site_id, vitrines_sites!inner(societe_id)').eq('id', req.params.id).maybeSingle();
      if (!photoRes.data) return res.status(404).json({ error: 'Photo introuvable' });
      if (photoRes.data.vitrines_sites.societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });

      var updates = {};
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.user_confirmed !== undefined) updates.user_confirmed = req.body.user_confirmed;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Rien a mettre a jour' });

      var updRes = await admin().from('vitrines_medias').update(updates).eq('id', req.params.id).select('*').single();
      if (updRes.error) throw updRes.error;
      res.json({ success: true, media: updRes.data });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /photos/site/:siteId — Photos avec filtre unconfirmed
  // ------------------------------------------
  router.get('/photos/site/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var query = admin().from('vitrines_medias').select('*').eq('site_id', req.params.siteId).order('created_at');
      if (req.query.unconfirmed_only === 'true') {
        query = query.eq('user_confirmed', false);
      }
      var dataRes = await query;
      if (dataRes.error) throw dataRes.error;

      // Generate presigned URLs
      var photos = await Promise.all((dataRes.data || []).map(async function(m) {
        try { m.url = await getPresignedUrl(m.storage_path, 3600); } catch (e) { m.url = null; }
        return m;
      }));

      res.json({ success: true, photos: photos });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /professions/categories-for-site/:siteId — Categories metier du site
  // ------------------------------------------
  router.get('/professions/categories-for-site/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('profession_id, societe_id').eq('id', req.params.siteId).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });
      if (siteRes.data.societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });

      var profConfig = getProfession(siteRes.data.profession_id);
      if (!profConfig) return res.json({ success: true, categories: [] });

      var categories = profConfig.photo_categories
        .filter(function(c) { return c.media_type !== 'video'; })
        .map(function(c) { return { key: c.id, label: c.poetic_label || c.label }; });

      res.json({ success: true, categories: categories });
    } catch (err) {
      console.error('[vitrines/photos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};

// ================================================================
// SHARED: Claude Vision analysis + auto-categorization
// ================================================================
async function analyzePhoto(media, professionId) {
  var imageUrl = await getPresignedUrl(media.storage_path, 3600);
  var profConfig = getProfession(professionId);
  var metier = profConfig ? profConfig.description_courte : 'professionnel';
  var profId = profConfig ? profConfig.id : '';
  var vocabHint = VISION_VOCAB[profId] || '';
  var isSante = profConfig && profConfig.category === 'sante';

  // Build categories list with poetic labels for the propositions prompt
  var catList = '';
  if (profConfig) {
    catList = profConfig.photo_categories
      .filter(function(c) { return c.media_type !== 'video'; })
      .map(function(c) {
        var hint = buildCategoryDescriptions(profConfig).split('\n').find(function(l) { return l.indexOf('- ' + c.id + ' :') === 0; }) || '';
        return '- ' + c.id + ' ("' + (c.poetic_label || c.label) + '")' + (hint ? ' : ' + hint.split(' : ')[1] : '');
      }).join('\n');
  }

  var prompt = 'Tu analyses une photo pour le site d\'un ' + metier + '.\n\n'
    + 'PROPOSE entre 2 et 3 categories POSSIBLES parmi la liste ci-dessous, classees par probabilite decroissante. Ne propose qu\'UNE seule categorie uniquement si c\'est absolument evident.\n\n'
    + 'Categories disponibles :\n' + catList + '\n\n'
    + (vocabHint ? vocabHint + '\n\n' : '')
    + (isSante ? 'RGPD : si visage reconnaissable ou partie identifiable d\'un patient, requires_consent: true.\n\n' : '')
    + 'REPONDS EN JSON STRICT, AUCUN TEXTE EN DEHORS :\n'
    + '{\n'
    + '  "observation": "Ce que tu vois en 1 phrase factuelle precise",\n'
    + '  "propositions": [\n'
    + '    { "category": "cle_technique", "label": "Label poetique", "reason": "Pourquoi (max 6 mots)" }\n'
    + '  ],\n'
    + '  "alt_text": "Description SEO courte",\n'
    + '  "requires_consent": false\n'
    + '}';

  var visionResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: prompt }
    ]}]
  });

  var content = visionResponse.content[0].text;
  var analysis;

  try {
    var jsonMatch = content.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (e) {
    analysis = { observation: content, propositions: [] };
  }

  var propositions = analysis.propositions || [];
  var observation = analysis.observation || '';
  var comment = observation; // backward compat
  var bestCategory = propositions.length > 0 ? propositions[0].category : media.category;
  var confidence = propositions.length === 1 ? 0.95 : (propositions.length === 2 ? 0.7 : 0.5);

  // Validate categories against profession
  if (profConfig) {
    var validIds = profConfig.photo_categories.map(function(c) { return c.id; });
    propositions = propositions.filter(function(p) { return validIds.includes(p.category); });
    if (!validIds.includes(bestCategory)) bestCategory = media.category;
  }

  // Build update
  var updatePayload = {
    ai_analysis: analysis,
    ai_propositions: propositions,
    observation: observation,
    alt_text: analysis.alt_text || null,
    ai_confidence: confidence,
    auto_categorized: propositions.length === 1,
    requires_consent: !!analysis.requires_consent,
    rgpd_validated: !analysis.requires_consent
  };

  // Auto-categorize only if single clear proposition
  if (propositions.length === 1) {
    updatePayload.category = bestCategory;
  }

  var updRes = await admin().from('vitrines_medias').update(updatePayload).eq('id', media.id).select('*').single();
  if (updRes.error) throw updRes.error;

  return { media: updRes.data, analysis: analysis, comment: comment };
}

// ================================================================
// BACKGROUND: batch processing for reanalyze
// ================================================================
async function processPhotosBackground(photos, jobId, professionId) {
  var BATCH = 5;
  var completed = 0;
  for (var i = 0; i < photos.length; i += BATCH) {
    var batch = photos.slice(i, i + BATCH);
    await Promise.all(batch.map(async function(photo) {
      try {
        await analyzePhoto(photo, professionId);
      } catch (err) {
        console.error('[reanalyze bg] photo ' + photo.id + ':', err.message);
      }
    }));
    completed += batch.length;
    await admin().from('vitrines_reanalyze_jobs').update({ completed: completed, updated_at: new Date().toISOString() }).eq('id', jobId);
  }
  await admin().from('vitrines_reanalyze_jobs').update({ status: 'done', completed: photos.length, updated_at: new Date().toISOString() }).eq('id', jobId);
  console.log('[reanalyze] Job ' + jobId + ' termine: ' + photos.length + ' photos');
}

// ================================================================
// VIDEO: Generate poster thumbnail + get duration
// ================================================================
async function generateVideoPoster(buffer, ext) {
  if (!FFMPEG_PATH) return {};

  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jadomi-vid-'));
  var inputPath = path.join(tmpDir, 'input.' + ext);
  var posterPath = path.join(tmpDir, 'poster.jpg');

  try {
    fs.writeFileSync(inputPath, buffer);

    // Get duration
    var duration = await new Promise(function(resolve) {
      execFile(FFMPEG_PATH, ['-i', inputPath, '-hide_banner'], { timeout: 10000 }, function(err, stdout, stderr) {
        var match = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+)/);
        if (match) resolve(parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]));
        else resolve(0);
      });
    });

    // Generate poster at 1 second
    await new Promise(function(resolve, reject) {
      execFile(FFMPEG_PATH, [
        '-i', inputPath,
        '-ss', '1',
        '-vframes', '1',
        '-vf', 'scale=1280:-2',
        '-q:v', '3',
        posterPath
      ], { timeout: 30000 }, function(err) {
        if (err) reject(err); else resolve();
      });
    });

    var posterBuffer = fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null;
    return { posterBuffer: posterBuffer, duration: duration };
  } finally {
    // Cleanup
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}
