'use strict';
// =============================================
// JADOMI — Analyse Radio & Plan de Traitement
// Capture écran + dictée vocale → Claude Vision
// → Plan de traitement structuré
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// --- Auth middleware autonome ---
function auth() {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Non authentifié' });
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.user = user;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Erreur authentification' });
    }
  };
}

// --- Catalogue actes pour le prompt IA ---
const ACTES_REF = `Catalogue actes dentaires JADOMI (utilise ces codes dans le champ "acte") :
CONSULTATION: premiere_consultation(30min), consultation_urgence(20min), consultation_controle(15min), bilan_parodontal(45min), radio_panoramique(15min), cone_beam(20min)
CONSERVATEUR: soin_carie_1face(20min), soin_carie_2faces(30min), soin_carie_3faces(40min), coiffage_pulpaire(40min), inlay_onlay_empreinte(45min)→inlay_onlay_pose(30min,J+10), scellement_sillon(15min)
ENDODONTIE: endo_mono(45min), endo_premolaire(60min), endo_molaire(90min), retraitement_endo(90min), drainage_abces(20min)
PARODONTOLOGIE: detartrage(30min), surfacage_1secteur(45min), surfacage_2secteurs(90min), maintenance_paro(30min), greffe_gingivale(90min), allongement_coronaire(60min)
PROTHÈSE FIXÉE: couronne_empreinte(45min)→couronne_pose(30min,J+8), bridge_empreinte(60min)→bridge_essayage(30min,J+8)→bridge_pose(30min,J+8), facette_empreinte(45min)→facette_pose(45min,J+10)
PROTHÈSE AMOVIBLE: pap_empreinte_primaire(30min)→pap_empreinte_secondaire(45min)→pap_essayage(30min,J+10)→pap_livraison(30min,J+8)
CHIRURGIE: extraction_simple(20min), extraction_complexe(45min), extraction_dds(45min), implant_pose(60min)→implant_pilier(30min,J+90), comblement_osseux(60min)
ESTHÉTIQUE: blanchiment_fauteuil(90min), composite_esthetique(45min)
PÉDODONTIE: examen_enfant(20min), soin_dent_lait(20min), coiffe_pediatrique(30min)`;

const SYSTEM_PROMPT = `Tu es un assistant en radiologie dentaire et planification de traitement pour un cabinet dentaire français.

RÈGLES IMPÉRATIVES :
- Tu NE poses PAS de diagnostic. Tu DÉCRIS ce que tu OBSERVES sur l'image.
- Notation FDI obligatoire (11 à 48) pour chaque dent.
- Identifie systématiquement : dents présentes et absentes, restaurations existantes (amalgames, composites, couronnes, implants), lésions péri-apicales, pertes osseuses (horizontale, verticale, cratériforme), inclusions, état des sinus maxillaires, trajet du canal mandibulaire, dents surnuméraires, kystes, granulomes.
- Si le praticien a dicté des observations cliniques complémentaires (caries débutantes non visibles à la radio, mobilités, sondages parodontaux, douleurs), intègre-les dans le plan de traitement.
- Utilise UNIQUEMENT les codes actes du catalogue ci-dessous.
- Organise le plan en phases : urgence → assainissement → restauration → réhabilitation → maintenance.
- Le plan doit être réaliste et séquencé (actes liés avec délais).

${ACTES_REF}

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "analyse_radio": {
    "type_radio": "panoramique|retro_alveolaire|cone_beam|photo_clinique|capture_ecran",
    "qualite_image": "bonne|acceptable|mediocre",
    "resume": "résumé factuel en 2-3 phrases de l'état bucco-dentaire",
    "dents_presentes": [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47],
    "dents_absentes": [18, 28, 38, 48],
    "observations": [
      { "dent": 36, "observation": "description factuelle de ce qui est observé", "severite": "urgent|a_traiter|a_surveiller" }
    ]
  },
  "plan_traitement": [
    {
      "priorite": 1,
      "phase": "urgence|assainissement|restauration|rehabilitation|maintenance",
      "acte": "code_acte_du_catalogue",
      "label": "Libellé lisible de l'acte",
      "dents": [36],
      "justification": "raison clinique",
      "duree_minutes": 30,
      "seances": 1
    }
  ],
  "recommandations": ["Recommandation 1", "Recommandation 2"]
}`;

// --- POST /api/radio-plan/analyze ---
router.post('/analyze', auth(), async (req, res) => {
  try {
    const { image_base64, observations_vocales } = req.body;
    if (!image_base64) {
      return res.status(400).json({ error: 'Image requise. Capturez votre radio.' });
    }

    // Nettoyer le base64
    const b64 = image_base64.replace(/^data:image\/[^;]+;base64,/, '');
    const mtMatch = image_base64.match(/^data:(image\/[^;]+)/);
    const mediaType = mtMatch ? mtMatch[1] : 'image/jpeg';

    // Construire le message utilisateur
    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }
    ];

    const obsText = (observations_vocales || '').trim();
    if (obsText) {
      userContent.push({
        type: 'text',
        text: `Analyse cette radiographie dentaire.\n\nObservations cliniques complémentaires du praticien (dictées vocalement) :\n"${obsText}"\n\nCombine l'analyse visuelle de la radio avec ces observations pour établir le plan de traitement complet.`
      });
    } else {
      userContent.push({
        type: 'text',
        text: 'Analyse cette radiographie dentaire et propose un plan de traitement structuré basé uniquement sur ce que tu observes.'
      });
    }

    console.log('[RADIO-PLAN] Analyse demandée par', req.user.email, '— observations:', obsText ? 'oui' : 'non');

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }]
    });

    const text = response.content?.[0]?.text || '';

    // Parser le JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      try {
        const result = JSON.parse(jsonStr);
        console.log('[RADIO-PLAN] Analyse OK —', (result.plan_traitement || []).length, 'actes proposés');
        return res.json({ ok: true, ...result });
      } catch (e) {
        // Tentative de réparation JSON
        try {
          jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
          const result = JSON.parse(jsonStr);
          return res.json({ ok: true, ...result });
        } catch (e2) {
          console.warn('[RADIO-PLAN] JSON invalide, retour texte brut');
          return res.json({ ok: true, raw_text: text });
        }
      }
    }

    res.json({ ok: true, raw_text: text });
  } catch (err) {
    console.error('[RADIO-PLAN] Erreur:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse : ' + err.message });
  }
});

module.exports = router;
