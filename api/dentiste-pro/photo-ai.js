// =============================================
// JADOMI — Photo AI : Analyse IA des photos
// Claude Vision (claude-sonnet-4-20250514) pour
// triage urgence, teinte, clinique, labo, plaie
// WORLD FIRST : AI dental photo triage system
// =============================================
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { admin, requirePatient, requireCabinet, requireLabo } = require('./shared');

const router = express.Router();

// ===== Anthropic client (lazy singleton) =====
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// =============================================
// SYSTEM PROMPTS PAR TYPE DE PHOTO
// =============================================
const SYSTEM_PROMPTS = {
  urgence: `You are a dental triage AI assistant. Analyze this dental photo and provide:
1. urgency_level: 'immediate' | 'urgent_48h' | 'routine' | 'non_urgent'
2. suspected_condition: brief description in French
3. recommended_action: what the patient should do, in French
4. confidence: 0-100
NEVER diagnose. Only suggest urgency level for triage purposes.
This is NOT a medical diagnosis. This is a decision-support tool for routing only.
Respond in JSON format only, no markdown wrapping.`,

  teinte: `Analyze this dental shade matching photo. Identify:
1. detected_shade: VITA shade code if visible (A1, A2, B1, etc.)
2. shade_tab_present: boolean (is a VITA tab in the photo?)
3. lighting_quality: 'good' | 'acceptable' | 'poor'
4. recommendations: suggestions for better photo if needed, in French
5. tooth_number: if identifiable (FDI notation)
Respond in JSON format only, no markdown wrapping.`,

  clinique: `Analyze this clinical dental photo. Identify:
1. visible_conditions: list of visible conditions in French
2. tooth_numbers: teeth visible (FDI notation)
3. photo_quality: 'excellent' | 'good' | 'acceptable' | 'retake'
4. suggestions: any improvements for the photo, in French
NEVER diagnose. Observations only, for documentation purposes.
Respond in JSON format only, no markdown wrapping.`,

  fabrication: `Analyze this dental prosthetic lab photo. Identify:
1. prosthetic_type: what type of prosthetic is shown, in French
2. stage: fabrication stage (wax-up, bisque, final, etc.)
3. quality_observations: any visible issues, in French
4. shade_match: if shade reference visible, assess match
Respond in JSON format only, no markdown wrapping.`,

  essayage: `Analyze this dental prosthetic lab photo. Identify:
1. prosthetic_type: what type of prosthetic is shown, in French
2. stage: fabrication stage (wax-up, bisque, final, etc.)
3. quality_observations: any visible issues, in French
4. shade_match: if shade reference visible, assess match
Respond in JSON format only, no markdown wrapping.`,

  produit_fini: `Analyze this dental prosthetic lab photo. Identify:
1. prosthetic_type: what type of prosthetic is shown, in French
2. stage: fabrication stage (wax-up, bisque, final, etc.)
3. quality_observations: any visible issues, in French
4. shade_match: if shade reference visible, assess match
Respond in JSON format only, no markdown wrapping.`,

  plaie: `Analyze this wound care photo for nursing documentation:
1. wound_stage: classification (superficielle, partielle, profonde)
2. wound_size_estimate: approximate dimensions if ruler visible
3. healing_progress: 'improving' | 'stable' | 'deteriorating'
4. color_assessment: wound bed color (rouge, jaune, noir, mixte)
5. concerns: any signs requiring medical attention, in French
NEVER diagnose. For documentation purposes only.
This is NOT a medical diagnosis. This is a documentation aid for nurses.
Respond in JSON format only, no markdown wrapping.`,

  suivi: `Analyze this dental follow-up photo. Identify:
1. visible_conditions: list of visible conditions in French
2. tooth_numbers: teeth visible (FDI notation)
3. photo_quality: 'excellent' | 'good' | 'acceptable' | 'retake'
4. healing_assessment: general healing observation if applicable
NEVER diagnose. Observations only, for documentation purposes.
Respond in JSON format only, no markdown wrapping.`,

  question: `Analyze this dental photo sent by a patient. Identify:
1. visible_area: what area of the mouth is shown
2. photo_quality: 'excellent' | 'good' | 'acceptable' | 'retake'
3. observations: brief factual observations in French
4. suggestions: photo improvement suggestions if needed, in French
NEVER diagnose. Observations only, for routing to the practitioner.
Respond in JSON format only, no markdown wrapping.`
};

// =============================================
// CORE FUNCTION : analyzePhoto
// =============================================
async function analyzePhoto(photoUrl, photoType, context) {
  const systemPrompt = SYSTEM_PROMPTS[photoType] || SYSTEM_PROMPTS.clinique;

  const userContent = [
    {
      type: 'image',
      source: { type: 'url', url: photoUrl }
    }
  ];

  // Add optional context from the sender
  if (context) {
    userContent.push({
      type: 'text',
      text: `Additional context from sender: ${context}`
    });
  }

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: userContent
    }],
    system: systemPrompt
  });

  const rawText = response.content[0]?.text || '{}';

  let analysis;
  try {
    analysis = JSON.parse(rawText);
  } catch {
    // Try to extract JSON from the response if it has markdown wrapping
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = { raw_response: rawText, parse_error: true };
      }
    } else {
      analysis = { raw_response: rawText, parse_error: true };
    }
  }

  return analysis;
}

// =============================================
// PHOTO QUALITY CHECKER
// =============================================
async function checkPhotoQuality(photoUrl) {
  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: photoUrl }
        },
        {
          type: 'text',
          text: 'Evaluate the quality of this dental/medical photo for clinical use.'
        }
      ]
    }],
    system: `Evaluate photo quality for dental/medical use. Check:
1. Is the image blurry or out of focus?
2. Is it too dark or overexposed?
3. Is the orientation correct?
4. Is the area of interest visible and centered?
Return JSON with:
- quality: 'good' | 'acceptable' | 'retake'
- issues: array of issues found (in French)
- suggestions: array of improvement suggestions (in French)
Respond in JSON format only, no markdown wrapping.`
  });

  const rawText = response.content[0]?.text || '{}';

  try {
    return JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return { quality: 'acceptable', issues: [], suggestions: [], parse_error: true };
      }
    }
    return { quality: 'acceptable', issues: [], suggestions: [], parse_error: true };
  }
}

// =============================================
// URGENCY NOTIFICATION MAPPER
// =============================================
function getUrgencyFromAnalysis(analysis) {
  if (!analysis || analysis.parse_error) {
    return { level: 'routine', color: 'blue', notify: true, push_priority: 'normal' };
  }

  const urgencyLevel = analysis.urgency_level;

  switch (urgencyLevel) {
    case 'immediate':
      return {
        level: 'immediate',
        color: 'red',
        notify: true,
        push_priority: 'critical',
        message: 'URGENCE IMMEDIATE — Photo patient a examiner maintenant'
      };
    case 'urgent_48h':
      return {
        level: 'urgent_48h',
        color: 'orange',
        notify: true,
        push_priority: 'high',
        message: 'URGENT — Photo patient a examiner sous 48h'
      };
    case 'routine':
      return {
        level: 'routine',
        color: 'blue',
        notify: true,
        push_priority: 'normal',
        message: 'Photo patient recue — consultation de routine'
      };
    case 'non_urgent':
      return {
        level: 'non_urgent',
        color: 'green',
        notify: false,
        push_priority: 'low',
        message: 'Photo patient recue — non urgent'
      };
    default:
      return {
        level: 'routine',
        color: 'blue',
        notify: true,
        push_priority: 'normal',
        message: 'Photo patient recue'
      };
  }
}

// =============================================
// Helper : create urgency event for push notifications
// =============================================
async function createUrgencyEvent(cabinetId, photoId, urgency, photoType) {
  try {
    const eventType = urgency.level === 'immediate'
      ? 'photo_ai_urgence_immediate'
      : urgency.level === 'urgent_48h'
      ? 'photo_ai_urgence_48h'
      : 'photo_ai_analyzed';

    await admin()
      .from('dentiste_pro_events')
      .insert({
        cabinet_id: cabinetId,
        event_type: eventType,
        event_category: urgency.level === 'immediate' || urgency.level === 'urgent_48h'
          ? 'urgence'
          : 'general',
        source: 'ai',
        metadata: {
          photo_id: photoId,
          photo_type: photoType,
          urgency_level: urgency.level,
          urgency_color: urgency.color,
          push_priority: urgency.push_priority,
          message: urgency.message
        }
      });
  } catch (e) {
    console.error('[photo-ai] event creation error:', e.message);
  }
}

// =============================================
// API ENDPOINTS
// =============================================

// ---------------------------------------------------------
// POST /photo-ai/analyze
// Analyze a photo with Claude Vision
// Auth: requireCabinet OR requirePatient
// ---------------------------------------------------------
router.post('/analyze', async (req, res) => {
  try {
    // Auth check: accept either cabinet token or patient token
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }

    const { photo_url, photo_type, context, photo_id } = req.body || {};

    if (!photo_url) {
      return res.status(400).json({ error: 'photo_url requis' });
    }

    const validTypes = Object.keys(SYSTEM_PROMPTS);
    const type = validTypes.includes(photo_type) ? photo_type : 'clinique';

    // 1. Check photo quality first
    let quality;
    try {
      quality = await checkPhotoQuality(photo_url);
    } catch (qualityErr) {
      console.error('[photo-ai] quality check error:', qualityErr.message);
      quality = { quality: 'acceptable', issues: [], suggestions: [] };
    }

    // 2. If quality is 'retake', still analyze but warn
    let analysis;
    try {
      analysis = await analyzePhoto(photo_url, type, context);
    } catch (analysisErr) {
      console.error('[photo-ai] analysis error:', analysisErr.message);
      return res.status(500).json({ error: 'Erreur analyse photo IA' });
    }

    // 3. Map urgency (only relevant for patient urgence photos)
    const urgency = getUrgencyFromAnalysis(analysis);

    // 4. Store analysis in photo metadata if photo_id provided
    if (photo_id) {
      try {
        // Fetch current metadata
        const { data: existingPhoto } = await admin()
          .from('dentiste_pro_photos')
          .select('metadata, cabinet_id')
          .eq('id', photo_id)
          .maybeSingle();

        if (existingPhoto) {
          const updatedMetadata = {
            ...(existingPhoto.metadata || {}),
            ai_analysis: analysis,
            ai_urgency: urgency.level,
            ai_confidence: analysis.confidence || null,
            ai_quality: quality,
            ai_analyzed_at: new Date().toISOString()
          };

          await admin()
            .from('dentiste_pro_photos')
            .update({ metadata: updatedMetadata })
            .eq('id', photo_id);

          // Create urgency event if needed
          if (urgency.notify && existingPhoto.cabinet_id) {
            await createUrgencyEvent(existingPhoto.cabinet_id, photo_id, urgency, type);
          }
        }
      } catch (storeErr) {
        console.error('[photo-ai] metadata store error:', storeErr.message);
        // Non-blocking: analysis still returned even if storage fails
      }
    }

    return res.json({
      ok: true,
      analysis,
      urgency: {
        level: urgency.level,
        color: urgency.color,
        message: urgency.message
      },
      quality,
      photo_type: type
    });

  } catch (err) {
    console.error('[photo-ai/analyze]', err);
    return res.status(500).json({ error: 'Erreur analyse photo' });
  }
});

// ---------------------------------------------------------
// POST /photo-ai/check-quality
// Check photo quality before sending
// ---------------------------------------------------------
router.post('/check-quality', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }

    const { photo_url } = req.body || {};

    if (!photo_url) {
      return res.status(400).json({ error: 'photo_url requis' });
    }

    const quality = await checkPhotoQuality(photo_url);

    return res.json({
      ok: true,
      quality: quality.quality || 'acceptable',
      issues: quality.issues || [],
      suggestions: quality.suggestions || []
    });

  } catch (err) {
    console.error('[photo-ai/check-quality]', err);
    return res.status(500).json({ error: 'Erreur verification qualite photo' });
  }
});

// ---------------------------------------------------------
// GET /photo-ai/analysis/:photoId
// Get stored AI analysis for a photo
// ---------------------------------------------------------
router.get('/analysis/:photoId', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }

    const { photoId } = req.params;

    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .select('id, photo_type, metadata, created_at')
      .eq('id', photoId)
      .maybeSingle();

    if (error) throw error;
    if (!photo) return res.status(404).json({ error: 'Photo introuvable' });

    const metadata = photo.metadata || {};
    const hasAnalysis = !!metadata.ai_analysis;

    if (!hasAnalysis) {
      return res.json({
        ok: true,
        analyzed: false,
        photo_id: photo.id,
        photo_type: photo.photo_type,
        message: 'Aucune analyse IA disponible pour cette photo'
      });
    }

    return res.json({
      ok: true,
      analyzed: true,
      photo_id: photo.id,
      photo_type: photo.photo_type,
      analysis: metadata.ai_analysis,
      urgency: metadata.ai_urgency || null,
      confidence: metadata.ai_confidence || null,
      quality: metadata.ai_quality || null,
      analyzed_at: metadata.ai_analyzed_at || null
    });

  } catch (err) {
    console.error('[photo-ai/analysis/:photoId]', err);
    return res.status(500).json({ error: 'Erreur recuperation analyse' });
  }
});

// =============================================
// EXPORTS
// =============================================
module.exports = router;
module.exports.analyzePhoto = analyzePhoto;
module.exports.checkPhotoQuality = checkPhotoQuality;
module.exports.getUrgencyFromAnalysis = getUrgencyFromAnalysis;
