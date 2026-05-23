// =============================================
// JADOMI AVOCAT EXPERT — Mémoire Cabinet
// Préférences de style, modèles favoris, tournures,
// juridictions fréquentes, apprentissage de style IA
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// === IA DISPATCH ===
let dispatch = null;
try {
  dispatch = require('../../lib/legal-providers/legal-ia-router').dispatch;
} catch {
  // Fallback si le module n'est pas disponible
  dispatch = null;
}

// === ENSURE TABLE ===
/**
 * Vérifie que la table avocat_cabinet_preferences existe.
 * Si non, log un avertissement (la migration SQL sera faite séparément).
 */
async function ensureTable() {
  try {
    await admin().from('avocat_cabinet_preferences').select('id').limit(1);
  } catch {
    console.warn('[memoire-cabinet] Table avocat_cabinet_preferences non trouvée — migration SQL requise.');
  }
}
ensureTable();

// === PRÉFÉRENCES PAR DÉFAUT ===
const DEFAULT_PREFERENCES = {
  style_redaction: 'formel',
  formule_politesse_client: '',
  formule_politesse_confrere: '',
  formule_signature: '',
  juridictions_habituelles: [],
  section_cph_frequente: 'commerce',
  mentions_cabinet: {
    nom_cabinet: '',
    adresse: '',
    telephone: '',
    fax: '',
    email: '',
    toque: '',
    rpva: '',
    barreau: '',
    siret: ''
  },
  modeles_favoris: [],
  tournures_favorites: [],
  article_700_standard: 2500,
  taux_horaire_defaut: 250,
  mentions_legales_pied_page: ''
};

// ================================================
// POST /preferences — Sauvegarder les préférences du cabinet (upsert)
// ================================================
router.post('/preferences', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;
    const body = req.body || {};

    // Construire l'objet préférences en fusionnant avec les défauts
    const preferences = {
      style_redaction: body.style_redaction || DEFAULT_PREFERENCES.style_redaction,
      formule_politesse_client: body.formule_politesse_client || DEFAULT_PREFERENCES.formule_politesse_client,
      formule_politesse_confrere: body.formule_politesse_confrere || DEFAULT_PREFERENCES.formule_politesse_confrere,
      formule_signature: body.formule_signature || DEFAULT_PREFERENCES.formule_signature,
      juridictions_habituelles: Array.isArray(body.juridictions_habituelles) ? body.juridictions_habituelles : DEFAULT_PREFERENCES.juridictions_habituelles,
      section_cph_frequente: body.section_cph_frequente || DEFAULT_PREFERENCES.section_cph_frequente,
      mentions_cabinet: body.mentions_cabinet && typeof body.mentions_cabinet === 'object'
        ? { ...DEFAULT_PREFERENCES.mentions_cabinet, ...body.mentions_cabinet }
        : DEFAULT_PREFERENCES.mentions_cabinet,
      modeles_favoris: Array.isArray(body.modeles_favoris) ? body.modeles_favoris : DEFAULT_PREFERENCES.modeles_favoris,
      tournures_favorites: Array.isArray(body.tournures_favorites) ? body.tournures_favorites : DEFAULT_PREFERENCES.tournures_favorites,
      article_700_standard: typeof body.article_700_standard === 'number' ? body.article_700_standard : DEFAULT_PREFERENCES.article_700_standard,
      taux_horaire_defaut: typeof body.taux_horaire_defaut === 'number' ? body.taux_horaire_defaut : DEFAULT_PREFERENCES.taux_horaire_defaut,
      mentions_legales_pied_page: body.mentions_legales_pied_page || DEFAULT_PREFERENCES.mentions_legales_pied_page
    };

    // Valider le style de rédaction
    const stylesValides = ['formel', 'semi_formel', 'technique'];
    if (preferences.style_redaction && !stylesValides.includes(preferences.style_redaction)) {
      return res.status(400).json({ error: 'Style de rédaction invalide. Valeurs acceptées : formel, semi_formel, technique' });
    }

    // Upsert : chercher si une entrée existe déjà pour ce cabinet
    const { data: existing } = await admin().from('avocat_cabinet_preferences')
      .select('id')
      .eq('societe_id', sid)
      .limit(1)
      .single();

    if (existing) {
      const { data, error } = await admin().from('avocat_cabinet_preferences')
        .update({ preferences, updated_at: new Date().toISOString(), updated_by: req.userId })
        .eq('societe_id', sid)
        .select()
        .single();
      if (error) throw error;
      return res.json({ success: true, message: 'Préférences mises à jour', data });
    } else {
      const { data, error } = await admin().from('avocat_cabinet_preferences')
        .insert({
          societe_id: sid,
          preferences,
          created_by: req.userId,
          updated_by: req.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.json({ success: true, message: 'Préférences créées', data });
    }
  } catch (err) {
    console.error('[memoire-cabinet] POST /preferences error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde des préférences' });
  }
});

// ================================================
// GET /preferences — Retourner les préférences du cabinet
// ================================================
router.get('/preferences', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;

    const { data, error } = await admin().from('avocat_cabinet_preferences')
      .select('*')
      .eq('societe_id', sid)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return res.json({ success: true, data: { societe_id: sid, preferences: DEFAULT_PREFERENCES } });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[memoire-cabinet] GET /preferences error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la récupération des préférences' });
  }
});

// ================================================
// PATCH /preferences — Mise à jour partielle (merge, pas écrasement)
// ================================================
router.patch('/preferences', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;
    const body = req.body || {};

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    // Valider le style de rédaction si fourni
    if (body.style_redaction) {
      const stylesValides = ['formel', 'semi_formel', 'technique'];
      if (!stylesValides.includes(body.style_redaction)) {
        return res.status(400).json({ error: 'Style de rédaction invalide. Valeurs acceptées : formel, semi_formel, technique' });
      }
    }

    // Récupérer les préférences existantes
    const { data: existing } = await admin().from('avocat_cabinet_preferences')
      .select('*')
      .eq('societe_id', sid)
      .limit(1)
      .single();

    const currentPrefs = (existing && existing.preferences) ? existing.preferences : { ...DEFAULT_PREFERENCES };

    // Fusionner les nouvelles valeurs (merge profond pour mentions_cabinet)
    const merged = { ...currentPrefs };
    for (const key of Object.keys(body)) {
      if (key === 'mentions_cabinet' && typeof body[key] === 'object') {
        merged.mentions_cabinet = { ...(currentPrefs.mentions_cabinet || {}), ...body[key] };
      } else if (Array.isArray(body[key])) {
        merged[key] = body[key];
      } else {
        merged[key] = body[key];
      }
    }

    if (existing) {
      const { data, error } = await admin().from('avocat_cabinet_preferences')
        .update({ preferences: merged, updated_at: new Date().toISOString(), updated_by: req.userId })
        .eq('societe_id', sid)
        .select()
        .single();
      if (error) throw error;
      return res.json({ success: true, message: 'Préférences mises à jour partiellement', data });
    } else {
      const { data, error } = await admin().from('avocat_cabinet_preferences')
        .insert({
          societe_id: sid,
          preferences: merged,
          created_by: req.userId,
          updated_by: req.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.json({ success: true, message: 'Préférences créées', data });
    }
  } catch (err) {
    console.error('[memoire-cabinet] PATCH /preferences error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour partielle' });
  }
});

// ================================================
// POST /apprendre-style — L'IA analyse un document et en extrait les patterns
// ================================================
router.post('/apprendre-style', requireAvocat, async (req, res) => {
  try {
    const { document_html } = req.body || {};

    if (!document_html || typeof document_html !== 'string' || document_html.trim().length < 50) {
      return res.status(400).json({ error: 'Le document fourni est trop court ou manquant (minimum 50 caractères)' });
    }

    if (!dispatch) {
      return res.status(503).json({ error: 'Le service d\'analyse IA n\'est pas disponible actuellement' });
    }

    // Nettoyer le HTML pour extraire le texte brut (réduire les tokens)
    const texteBrut = document_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Limiter la taille pour éviter les coûts excessifs
    const texteAnalyse = texteBrut.substring(0, 8000);

    const prompt = `Vous êtes un expert en analyse de style rédactionnel juridique.
Analysez le document suivant et extrayez les patterns de rédaction du cabinet.

DOCUMENT :
${texteAnalyse}

Répondez UNIQUEMENT en JSON valide avec cette structure :
{
  "style_detecte": "formel" | "semi_formel" | "technique",
  "formules_recurrentes": ["liste des formules de politesse et expressions récurrentes"],
  "tournures_favorites": ["liste des tournures juridiques utilisées fréquemment"],
  "structure_habituelle": "description de la structure type du document",
  "longueur_moyenne_paragraphes": "courte|moyenne|longue",
  "niveau_formalisme": 1-10,
  "vocabulaire_specifique": ["termes juridiques récurrents"],
  "formule_ouverture": "formule d'ouverture détectée ou null",
  "formule_conclusion": "formule de conclusion détectée ou null",
  "recommandations": ["suggestions pour améliorer la cohérence du style"]
}`;

    const result = await dispatch('summarize_dossier', prompt, {
      temperature: 0.2,
      maxTokens: 1500
    });

    // Tenter de parser le JSON de la réponse
    let patterns = null;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        patterns = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Si le parsing échoue, retourner le texte brut
    }

    return res.json({
      success: true,
      patterns: patterns || { raw: result.text },
      message: 'Analyse de style terminée. Vous pouvez sauvegarder ces préférences via PATCH /preferences.'
    });
  } catch (err) {
    console.error('[memoire-cabinet] POST /apprendre-style error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'analyse de style' });
  }
});

// ================================================
// POST /appliquer-style — Adapter un document au style du cabinet
// ================================================
router.post('/appliquer-style', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;
    const { document_html } = req.body || {};

    if (!document_html || typeof document_html !== 'string' || document_html.trim().length < 20) {
      return res.status(400).json({ error: 'Le document fourni est trop court ou manquant' });
    }

    if (!dispatch) {
      return res.status(503).json({ error: 'Le service d\'analyse IA n\'est pas disponible actuellement' });
    }

    // Récupérer les préférences du cabinet
    const { data: prefData } = await admin().from('avocat_cabinet_preferences')
      .select('preferences')
      .eq('societe_id', sid)
      .limit(1)
      .single();

    const prefs = (prefData && prefData.preferences) ? prefData.preferences : DEFAULT_PREFERENCES;

    // Nettoyer le HTML
    const texteBrut = document_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const texteAdapte = texteBrut.substring(0, 8000);

    const prompt = `Vous êtes un assistant juridique expert. Adaptez le document suivant au style du cabinet.

PRÉFÉRENCES DU CABINET :
- Style de rédaction : ${prefs.style_redaction || 'formel'}
- Formule de politesse client : ${prefs.formule_politesse_client || 'standard'}
- Formule de politesse confrère : ${prefs.formule_politesse_confrere || 'standard'}
- Formule de signature : ${prefs.formule_signature || 'standard'}
- Tournures favorites : ${(prefs.tournures_favorites || []).join(' ; ') || 'aucune'}
- Mentions du cabinet : ${prefs.mentions_cabinet ? JSON.stringify(prefs.mentions_cabinet) : 'non renseignées'}
- Mentions légales pied de page : ${prefs.mentions_legales_pied_page || 'aucune'}

DOCUMENT À ADAPTER :
${texteAdapte}

CONSIGNES :
1. Remplacez les formules génériques par les formules favorites du cabinet
2. Adaptez le niveau de formalisme (${prefs.style_redaction || 'formel'})
3. Insérez les mentions du cabinet en en-tête si disponibles
4. Insérez la formule de signature en fin de document si disponible
5. Conservez le fond juridique intact
6. Ajoutez les mentions légales en pied de page si disponibles

Retournez le document adapté en texte structuré.`;

    const result = await dispatch('summarize_dossier', prompt, {
      temperature: 0.3,
      maxTokens: 4000
    });

    return res.json({
      success: true,
      document_adapte: result.text,
      preferences_appliquees: {
        style: prefs.style_redaction,
        cabinet: prefs.mentions_cabinet ? prefs.mentions_cabinet.nom_cabinet : null
      }
    });
  } catch (err) {
    console.error('[memoire-cabinet] POST /appliquer-style error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'adaptation du style' });
  }
});

// ================================================
// GET /juridictions — Juridictions utilisées par le cabinet, triées par fréquence
// ================================================
router.get('/juridictions', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;

    // Récupérer les juridictions depuis les dossiers existants
    const { data: dossiers, error } = await admin().from('avocat_dossiers')
      .select('juridiction')
      .eq('avocat_societe_id', sid)
      .not('juridiction', 'is', null);

    if (error) throw error;

    // Compter les fréquences
    const frequences = {};
    (dossiers || []).forEach(d => {
      const j = (d.juridiction || '').trim();
      if (j) {
        frequences[j] = (frequences[j] || 0) + 1;
      }
    });

    // Trier par fréquence décroissante
    const juridictions = Object.entries(frequences)
      .map(([nom, count]) => ({ nom, count }))
      .sort((a, b) => b.count - a.count);

    // Ajouter les juridictions habituelles des préférences (si elles ne sont pas déjà dans la liste)
    const { data: prefData } = await admin().from('avocat_cabinet_preferences')
      .select('preferences')
      .eq('societe_id', sid)
      .limit(1)
      .single();

    const prefJuridictions = (prefData && prefData.preferences && prefData.preferences.juridictions_habituelles) || [];
    const nomsExistants = new Set(juridictions.map(j => j.nom));
    prefJuridictions.forEach(j => {
      if (!nomsExistants.has(j)) {
        juridictions.push({ nom: j, count: 0, source: 'preferences' });
      }
    });

    return res.json({ success: true, juridictions, total: juridictions.length });
  } catch (err) {
    console.error('[memoire-cabinet] GET /juridictions error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la récupération des juridictions' });
  }
});

// ================================================
// GET /statistiques — Statistiques du cabinet
// ================================================
router.get('/statistiques', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;

    // Récupérer tous les dossiers du cabinet
    const { data: dossiers, error: errDossiers } = await admin().from('avocat_dossiers')
      .select('id, type_contentieux, etape, juridiction, resultat, montant_obtenu, created_at, closed_at')
      .eq('avocat_societe_id', sid);

    if (errDossiers) throw errDossiers;

    const allDossiers = dossiers || [];
    const totalDossiers = allDossiers.length;

    // 1. Nombre de dossiers par type de contentieux
    const parType = {};
    allDossiers.forEach(d => {
      const type = d.type_contentieux || 'non_renseigné';
      parType[type] = (parType[type] || 0) + 1;
    });

    // 2. Taux de succès estimé
    const clos = allDossiers.filter(d => d.closed_at || d.etape === 'clos' || d.etape === 'termine');
    const favorables = clos.filter(d => d.resultat === 'favorable' || d.resultat === 'gain');
    const defavorables = clos.filter(d => d.resultat === 'defavorable' || d.resultat === 'perte');
    const tauxSucces = clos.length > 0 ? Math.round((favorables.length / clos.length) * 100) : null;

    // 3. Montant moyen obtenu par type
    const montantsParType = {};
    allDossiers.forEach(d => {
      if (d.montant_obtenu && d.montant_obtenu > 0) {
        const type = d.type_contentieux || 'non_renseigné';
        if (!montantsParType[type]) montantsParType[type] = [];
        montantsParType[type].push(d.montant_obtenu);
      }
    });
    const montantMoyenParType = {};
    for (const [type, montants] of Object.entries(montantsParType)) {
      montantMoyenParType[type] = Math.round(montants.reduce((a, b) => a + b, 0) / montants.length);
    }

    // 4. Durée moyenne des procédures (en jours)
    const durees = clos
      .filter(d => d.created_at && d.closed_at)
      .map(d => Math.floor((new Date(d.closed_at).getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)));
    const dureeMoyenne = durees.length > 0 ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : null;

    // 5. Juridictions les plus utilisées
    const juridictions = {};
    allDossiers.forEach(d => {
      const j = (d.juridiction || '').trim();
      if (j) juridictions[j] = (juridictions[j] || 0) + 1;
    });
    const topJuridictions = Object.entries(juridictions)
      .map(([nom, count]) => ({ nom, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.json({
      success: true,
      statistiques: {
        total_dossiers: totalDossiers,
        dossiers_en_cours: allDossiers.filter(d => !d.closed_at && d.etape !== 'clos' && d.etape !== 'termine').length,
        dossiers_clos: clos.length,
        dossiers_par_type: parType,
        taux_succes: tauxSucces !== null ? `${tauxSucces}%` : 'Données insuffisantes',
        favorables: favorables.length,
        defavorables: defavorables.length,
        montant_moyen_par_type: montantMoyenParType,
        duree_moyenne_jours: dureeMoyenne,
        top_juridictions: topJuridictions
      }
    });
  } catch (err) {
    console.error('[memoire-cabinet] GET /statistiques error:', err.message);
    return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
  }
});

module.exports = router;
