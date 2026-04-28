// =============================================
// JADOMI LABO — Routes shade / colorimetrie
// Photos teinte dentaire + analyse IA Claude Vision
// =============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { admin } = require('../../api/multiSocietes/middleware');

// Multer config — memory storage for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptees'));
  }
});

// ── GET /api/labo/shade/cases — Liste des cas shade ──
router.get('/cases', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { dentiste_id, cas_production_id, statut } = req.query;

    let query = admin().from('labo_shade_cases')
      .select('*, labo_shade_photos(id, url, type, created_at)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('created_at', { ascending: false });

    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (cas_production_id) query = query.eq('cas_production_id', cas_production_id);
    if (statut) query = query.eq('statut', statut);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ cases: data || [] });
  } catch (e) {
    console.error('[LABO shade list]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── GET /api/labo/shade/cases/:id — Detail d'un cas shade ──
router.get('/cases/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data, error } = await admin().from('labo_shade_cases')
      .select('*, labo_shade_photos(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Cas non trouve' });
    res.json({ shade_case: data });
  } catch (e) {
    console.error('[LABO shade detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── POST /api/labo/shade/cases — Creer un cas shade ──
router.post('/cases', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { dentiste_id, cas_production_id, patient_ref, dents, teintier_reference } = req.body;

    if (!patient_ref && !cas_production_id) {
      return res.status(400).json({ error: 'patient_ref ou cas_production_id requis' });
    }

    const { data, error } = await admin().from('labo_shade_cases').insert({
      prothesiste_id: req.prothesisteId,
      dentiste_id: dentiste_id || null,
      cas_production_id: cas_production_id || null,
      patient_ref: patient_ref || null,
      dents: dents || null,
      teintier_reference: teintier_reference || 'VITA Classical'
    }).select().single();

    if (error) throw error;
    res.json({ success: true, shade_case: data });
  } catch (e) {
    console.error('[LABO shade create]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── POST /api/labo/shade/cases/:id/photos — Upload photo(s) ──
router.post('/cases/:id/photos', upload.single('image'), async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    if (!req.file) return res.status(400).json({ error: 'Image requise' });

    // Verifier que le cas appartient au prothesiste
    const { data: shadeCase, error: caseErr } = await admin().from('labo_shade_cases')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (caseErr || !shadeCase) return res.status(404).json({ error: 'Cas non trouve' });

    // Upload vers Supabase storage
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const fileName = `${req.prothesisteId}/${req.params.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await admin().storage
      .from('shade-photos')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadErr) throw uploadErr;

    // URL publique
    const { data: urlData } = admin().storage
      .from('shade-photos')
      .getPublicUrl(fileName);

    const photoUrl = urlData?.publicUrl || '';

    // Enregistrer en base
    const photoType = req.body.type || 'labial';
    const { data: photo, error: insertErr } = await admin().from('labo_shade_photos').insert({
      shade_case_id: req.params.id,
      url: photoUrl,
      type: photoType,
      notes: req.body.notes || null
    }).select().single();

    if (insertErr) throw insertErr;

    // Mettre a jour le timestamp du cas
    await admin().from('labo_shade_cases')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, photo });
  } catch (e) {
    console.error('[LABO shade photo upload]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── POST /api/labo/shade/cases/:id/analyser — Analyse IA Claude Vision ──
router.post('/cases/:id/analyser', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'JADOMI IA non disponible' });

    // Charger le cas + photos
    const { data: shadeCase, error: caseErr } = await admin().from('labo_shade_cases')
      .select('*, labo_shade_photos(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (caseErr || !shadeCase) return res.status(404).json({ error: 'Cas non trouve' });

    const photos = shadeCase.labo_shade_photos || [];
    if (photos.length === 0) return res.status(400).json({ error: 'Aucune photo dans ce cas' });

    // Construire les blocs image pour Claude Vision
    const imageBlocks = [];
    for (const photo of photos) {
      if (!photo.url) continue;
      try {
        const response = await fetch(photo.url);
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        // Detecter le media type depuis l'URL
        let mediaType = 'image/jpeg';
        if (photo.url.includes('.png')) mediaType = 'image/png';
        else if (photo.url.includes('.webp')) mediaType = 'image/webp';

        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        });
        // Ajouter legende
        imageBlocks.push({
          type: 'text',
          text: `Photo type: ${photo.type}${photo.notes ? ` — ${photo.notes}` : ''}`
        });
      } catch (e) {
        // Skip photos inaccessibles
        continue;
      }
    }

    if (imageBlocks.length === 0) {
      return res.status(400).json({ error: 'Aucune photo accessible pour analyse' });
    }

    const teintier = shadeCase.teintier_reference || 'VITA Classical';
    const dentsInfo = shadeCase.dents?.length ? `Dent(s) concernee(s) : ${shadeCase.dents.join(', ')}` : '';

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `Vous etes un expert en colorimetrie dentaire avec 20 ans d'experience en prothese dentaire. Vous maitrisez tous les teintiers (VITA Classical, VITA 3D-Master, Ivoclar Chromascop, etc.) et savez analyser les nuances de teinte a partir de photos cliniques.

Vous devez TOUJOURS repondre en JSON strict, sans texte autour.`,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: `Analysez ces photos de dent(s) pour determiner la teinte precise.
${dentsInfo}
Teintier de reference : ${teintier}

Determinez :
1. Teinte dominante selon le teintier ${teintier}
2. Variations de teinte par zone : cervical (collet), corps, bord incisif
3. Niveau de translucidite : opaque / semi-translucide / translucide
4. Texture de surface : lisse / granulee / striee
5. Observations chromatiques (cast couleur de la photo, qualite d'eclairage, fond)
6. Corrections chromatiques necessaires si la photo a un cast couleur
7. Teinte recommandee avec degre de confiance (0-100)
8. Teintes alternatives proches

Repondez en JSON strict :
{
  "teinte_dominante": "A2",
  "variations": {
    "cervical": "A3",
    "corps": "A2",
    "incisif": "A1"
  },
  "translucidite": "semi-translucide",
  "texture_surface": "lisse",
  "observations_chromatiques": "...",
  "corrections_couleur": "...",
  "teintier_utilise": "${teintier}",
  "teintes_recommandees": [
    { "code": "A2", "confiance": 85, "zone": "dominante" },
    { "code": "A2.5", "confiance": 70, "zone": "alternative" }
  ],
  "confiance_globale": 85,
  "recommandations_prothesiste": "...",
  "qualite_photos": "bonne / moyenne / insuffisante"
}`
          }
        ]
      }]
    });

    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);

    let analyse = null;
    if (m) {
      try {
        analyse = JSON.parse(m[0]);
      } catch (e) {
        analyse = { raw: txt, parse_error: true };
      }
    }

    if (!analyse) {
      return res.status(500).json({ error: 'Analyse IA non exploitable' });
    }

    // Sauvegarder l'analyse dans le cas
    const { error: updateErr } = await admin().from('labo_shade_cases')
      .update({
        analyse_ia: analyse,
        teinte_finale: analyse.teinte_dominante || null,
        statut: 'analyse',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, analyse });
  } catch (e) {
    console.error('[LABO shade analyser]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── PUT /api/labo/shade/cases/:id — Mettre a jour un cas ──
router.put('/cases/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const allowed = ['notes', 'teinte_finale', 'statut', 'teintier_reference', 'dents', 'patient_ref', 'dentiste_id', 'cas_production_id'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin().from('labo_shade_cases')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cas non trouve' });
    res.json({ success: true, shade_case: data });
  } catch (e) {
    console.error('[LABO shade update]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ── DELETE /api/labo/shade/cases/:id/photos/:photoId — Supprimer une photo ──
router.delete('/cases/:id/photos/:photoId', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    // Verifier ownership du cas
    const { data: shadeCase } = await admin().from('labo_shade_cases')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!shadeCase) return res.status(404).json({ error: 'Cas non trouve' });

    // Recuperer la photo pour supprimer du storage
    const { data: photo } = await admin().from('labo_shade_photos')
      .select('url')
      .eq('id', req.params.photoId)
      .eq('shade_case_id', req.params.id)
      .single();

    if (!photo) return res.status(404).json({ error: 'Photo non trouvee' });

    // Supprimer du storage Supabase
    if (photo.url) {
      try {
        // Extraire le path depuis l'URL publique
        const urlParts = photo.url.split('/shade-photos/');
        if (urlParts[1]) {
          await admin().storage.from('shade-photos').remove([decodeURIComponent(urlParts[1])]);
        }
      } catch (e) {
        // Continue meme si suppression storage echoue
        console.warn('[LABO shade] Storage delete failed:', e.message);
      }
    }

    // Supprimer de la base
    const { error } = await admin().from('labo_shade_photos')
      .delete()
      .eq('id', req.params.photoId)
      .eq('shade_case_id', req.params.id);

    if (error) throw error;

    // Mettre a jour le timestamp du cas
    await admin().from('labo_shade_cases')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO shade photo delete]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
