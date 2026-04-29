// =============================================
// JADOMI LABO — Fichiers 3D + validation design
// Gestion STL/PLY/OBJ/3MF, versions, approbation dentiste
// =============================================

const express = require('express');
const router = express.Router();
const portailRouter = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { admin } = require('../../api/multiSocietes/middleware');

// Multer config — memory storage for Supabase upload, 100MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.stl', '.ply', '.obj', '.dcm', '.3mf', '.step', '.iges'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non supporté. Formats acceptés: STL, PLY, OBJ, DCM, 3MF, STEP, IGES'));
  }
});

// =============================================
// HELPER: Validate portail token for dentist
// =============================================
async function validatePortailToken(token) {
  if (!token) return null;

  const { data, error } = await admin()
    .from('labo_validations_3d')
    .select('id, dentiste_id, prothesiste_id, fichier_id, statut')
    .eq('token', token)
    .gt('token_expire_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  // Get dentiste info
  const { data: dentiste } = await admin()
    .from('dentistes_clients')
    .select('id, nom, prenom, prothesiste_id')
    .eq('id', data.dentiste_id)
    .maybeSingle();

  if (!dentiste) return null;
  return { validation: data, dentiste };
}

// =============================================
// LAB-SIDE ENDPOINTS (auth via labo middleware)
// =============================================

// ── GET /api/labo/fichiers3d — Liste des fichiers 3D ──
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    const { cas_production_id, dentiste_id, type_fichier, statut_validation } = req.query;

    let query = admin().from('labo_fichiers3d')
      .select('*, labo_validations_3d(id, statut, date_soumission, date_reponse)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('created_at', { ascending: false });

    if (cas_production_id) query = query.eq('cas_production_id', cas_production_id);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (type_fichier) query = query.eq('type_fichier', type_fichier);

    const { data, error } = await query;
    if (error) throw error;

    let fichiers = data || [];

    // Filter by validation status if requested
    if (statut_validation) {
      fichiers = fichiers.filter(f => {
        const validations = f.labo_validations_3d || [];
        if (statut_validation === 'non_soumis') return validations.length === 0;
        return validations.some(v => v.statut === statut_validation);
      });
    }

    res.json({ fichiers });
  } catch (e) {
    console.error('[LABO fichiers3d list]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── GET /api/labo/fichiers3d/validations — Toutes les validations ──
router.get('/validations', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    const { statut } = req.query;

    let query = admin().from('labo_validations_3d')
      .select(`
        *,
        labo_fichiers3d(id, nom_fichier, type_fichier, url, version, description),
        dentistes_clients(id, nom, prenom, cabinet_nom)
      `)
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_soumission', { ascending: false });

    if (statut) query = query.eq('statut', statut);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ validations: data || [] });
  } catch (e) {
    console.error('[LABO fichiers3d validations]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── GET /api/labo/fichiers3d/:id — Detail d'un fichier 3D ──
router.get('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    const { data: fichier, error } = await admin().from('labo_fichiers3d')
      .select('*, labo_validations_3d(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !fichier) return res.status(404).json({ error: 'Fichier non trouvé' });

    // Get version history (other versions of the same file)
    let versions = [];
    const rootId = fichier.parent_id || fichier.id;
    const { data: allVersions } = await admin().from('labo_fichiers3d')
      .select('id, version, nom_fichier, taille_octets, url, version_notes, created_at')
      .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .eq('prothesiste_id', req.prothesisteId)
      .order('version', { ascending: true });

    versions = allVersions || [];

    res.json({ fichier, versions });
  } catch (e) {
    console.error('[LABO fichiers3d detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── POST /api/labo/fichiers3d — Upload un fichier 3D ──
router.post('/', upload.single('fichier'), async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    const { cas_production_id, dentiste_id, type_fichier, description, version_notes } = req.body;

    if (!type_fichier) return res.status(400).json({ error: 'type_fichier requis' });

    // Upload to Supabase Storage
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const storagePath = `${req.prothesisteId}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const { error: uploadError } = await admin().storage
      .from('fichiers-3d')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = admin().storage
      .from('fichiers-3d')
      .getPublicUrl(storagePath);

    const url = urlData?.publicUrl || storagePath;

    // Insert record
    const { data: fichier, error } = await admin().from('labo_fichiers3d')
      .insert({
        prothesiste_id: req.prothesisteId,
        cas_production_id: cas_production_id || null,
        dentiste_id: dentiste_id || null,
        nom_fichier: req.file.originalname,
        type_fichier,
        taille_octets: req.file.size,
        url,
        version: 1,
        description: description || null,
        version_notes: version_notes || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ fichier });
  } catch (e) {
    console.error('[LABO fichiers3d upload]', e.message);
    res.status(500).json({ error: 'Erreur upload fichier 3D' });
  }
});

// ── POST /api/labo/fichiers3d/:id/version — Nouvelle version ──
router.post('/:id/version', upload.single('fichier'), async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    // Get parent file
    const { data: parent, error: parentErr } = await admin().from('labo_fichiers3d')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (parentErr || !parent) return res.status(404).json({ error: 'Fichier parent non trouvé' });

    // Determine root and next version number
    const rootId = parent.parent_id || parent.id;

    const { data: maxVersionRow } = await admin().from('labo_fichiers3d')
      .select('version')
      .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .eq('prothesiste_id', req.prothesisteId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (maxVersionRow?.version || 1) + 1;

    // Upload to Supabase Storage
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const storagePath = `${req.prothesisteId}/${Date.now()}_v${nextVersion}_${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const { error: uploadError } = await admin().storage
      .from('fichiers-3d')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin().storage
      .from('fichiers-3d')
      .getPublicUrl(storagePath);

    const url = urlData?.publicUrl || storagePath;

    const { version_notes } = req.body;

    const { data: fichier, error } = await admin().from('labo_fichiers3d')
      .insert({
        prothesiste_id: req.prothesisteId,
        cas_production_id: parent.cas_production_id,
        dentiste_id: parent.dentiste_id,
        nom_fichier: req.file.originalname,
        type_fichier: parent.type_fichier,
        taille_octets: req.file.size,
        url,
        version: nextVersion,
        parent_id: rootId,
        description: parent.description,
        version_notes: version_notes || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ fichier });
  } catch (e) {
    console.error('[LABO fichiers3d version]', e.message);
    res.status(500).json({ error: 'Erreur upload nouvelle version' });
  }
});

// ── DELETE /api/labo/fichiers3d/:id — Supprimer un fichier ──
router.delete('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    // Verify ownership
    const { data: fichier, error: fetchErr } = await admin().from('labo_fichiers3d')
      .select('id, url')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (fetchErr || !fichier) return res.status(404).json({ error: 'Fichier non trouvé' });

    // Delete from storage (extract path from URL)
    try {
      const urlParts = fichier.url.split('/fichiers-3d/');
      if (urlParts.length > 1) {
        await admin().storage.from('fichiers-3d').remove([urlParts[1]]);
      }
    } catch (storageErr) {
      console.warn('[LABO fichiers3d] Storage delete warning:', storageErr.message);
    }

    // Delete DB record (cascades to validations)
    const { error } = await admin().from('labo_fichiers3d')
      .delete()
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId);

    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO fichiers3d delete]', e.message);
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// ── POST /api/labo/fichiers3d/:id/soumettre-validation — Soumettre au dentiste ──
router.post('/:id/soumettre-validation', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    // Verify file exists and belongs to this lab
    const { data: fichier, error: fetchErr } = await admin().from('labo_fichiers3d')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (fetchErr || !fichier) return res.status(404).json({ error: 'Fichier non trouvé' });
    if (!fichier.dentiste_id) return res.status(400).json({ error: 'Aucun dentiste associé à ce fichier' });

    // Generate unique token, valid 14 days
    const token = crypto.randomBytes(32).toString('hex');
    const tokenExpire = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Create validation request
    const { data: validation, error } = await admin().from('labo_validations_3d')
      .insert({
        fichier_id: fichier.id,
        prothesiste_id: req.prothesisteId,
        dentiste_id: fichier.dentiste_id,
        statut: 'en_attente',
        token,
        token_expire_at: tokenExpire.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Build validation URL
    const host = req.headers.host || 'app.jadomi.fr';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const validationUrl = `${protocol}://${host}/portail-validation-3d.html?token=${token}`;

    res.status(201).json({
      validation,
      validation_url: validationUrl,
      token,
      expire_at: tokenExpire.toISOString()
    });
  } catch (e) {
    console.error('[LABO fichiers3d soumettre-validation]', e.message);
    res.status(500).json({ error: 'Erreur soumission validation' });
  }
});

// =============================================
// PORTAIL 3D — Dentist-facing endpoints (token auth)
// =============================================

// Middleware: validate token from query or header
portailRouter.use(async (req, res, next) => {
  try {
    const token = req.query.token || req.headers['x-validation-token'];
    if (!token) return res.status(401).json({ error: 'Token requis' });

    // Find dentiste via token — check all active validations for this token
    const { data: validation } = await admin()
      .from('labo_validations_3d')
      .select('id, dentiste_id, prothesiste_id')
      .eq('token', token)
      .gt('token_expire_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (!validation) return res.status(401).json({ error: 'Token invalide ou expiré' });

    // Get dentiste info
    const { data: dentiste } = await admin()
      .from('dentistes_clients')
      .select('id, nom, prenom, cabinet_nom')
      .eq('id', validation.dentiste_id)
      .maybeSingle();

    if (!dentiste) return res.status(401).json({ error: 'Dentiste introuvable' });

    req.dentisteId = dentiste.id;
    req.dentiste = dentiste;
    req.portailProthesisteId = validation.prothesiste_id;
    req.validationToken = token;

    next();
  } catch (e) {
    console.error('[PORTAIL 3D auth]', e.message);
    res.status(500).json({ error: 'Erreur authentification portail' });
  }
});

// ── GET /api/labo/portail-3d/validations — Validations en attente du dentiste ──
portailRouter.get('/validations', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('labo_validations_3d')
      .select(`
        *,
        labo_fichiers3d(id, nom_fichier, type_fichier, taille_octets, url, version, description, version_notes, created_at)
      `)
      .eq('dentiste_id', req.dentisteId)
      .eq('prothesiste_id', req.portailProthesisteId)
      .order('date_soumission', { ascending: false });

    if (error) throw error;

    res.json({ validations: data || [] });
  } catch (e) {
    console.error('[PORTAIL 3D validations list]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── GET /api/labo/portail-3d/validations/:id — Detail validation ──
portailRouter.get('/validations/:id', async (req, res) => {
  try {
    const { data: validation, error } = await admin()
      .from('labo_validations_3d')
      .select(`
        *,
        labo_fichiers3d(id, nom_fichier, type_fichier, taille_octets, url, version, description, version_notes, created_at)
      `)
      .eq('id', req.params.id)
      .eq('dentiste_id', req.dentisteId)
      .single();

    if (error || !validation) return res.status(404).json({ error: 'Validation non trouvée' });

    // Generate a signed download URL (valid 1 hour)
    let download_url = null;
    if (validation.labo_fichiers3d?.url) {
      try {
        const urlParts = validation.labo_fichiers3d.url.split('/fichiers-3d/');
        if (urlParts.length > 1) {
          const { data: signedData } = await admin().storage
            .from('fichiers-3d')
            .createSignedUrl(urlParts[1], 3600); // 1 hour
          download_url = signedData?.signedUrl || validation.labo_fichiers3d.url;
        }
      } catch (_) {
        download_url = validation.labo_fichiers3d.url;
      }
    }

    res.json({ validation, download_url });
  } catch (e) {
    console.error('[PORTAIL 3D validation detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── POST /api/labo/portail-3d/validations/:id/repondre — Approuver/rejeter ──
portailRouter.post('/validations/:id/repondre', async (req, res) => {
  try {
    const { decision, commentaire, annotations } = req.body;

    if (!decision) return res.status(400).json({ error: 'decision requis' });
    if (!['approuve', 'rejete', 'modification'].includes(decision)) {
      return res.status(400).json({ error: 'decision invalide. Valeurs: approuve, rejete, modification' });
    }

    // Verify this validation belongs to the dentist
    const { data: validation, error: fetchErr } = await admin()
      .from('labo_validations_3d')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('dentiste_id', req.dentisteId)
      .single();

    if (fetchErr || !validation) return res.status(404).json({ error: 'Validation non trouvée' });

    if (validation.statut !== 'en_attente') {
      return res.status(400).json({ error: 'Cette validation a déjà été traitée', statut: validation.statut });
    }

    // Update validation
    const { data: updated, error } = await admin()
      .from('labo_validations_3d')
      .update({
        statut: decision,
        commentaire: commentaire || null,
        annotations: annotations || null,
        date_reponse: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ validation: updated });
  } catch (e) {
    console.error('[PORTAIL 3D repondre]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = { fichiers3dRouter: router, portail3dRouter: portailRouter };
