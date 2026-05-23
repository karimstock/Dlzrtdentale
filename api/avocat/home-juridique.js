// =============================================
// JADOMI AVOCAT — Home Juridique (Page d'accueil module avocat)
// Jurisprudence semaine, alertes, dossiers prioritaires, tendances
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const judilibre = require('../../lib/legal-providers/judilibre');
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE (copie exacte du pattern dashboard.js) ===
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
  } catch { return res.status(401).json({ error: 'Auth échouée' }); }
}

// === HELPERS ===
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function hoursAgo(n) {
  return new Date(Date.now() - n * 3600000).toISOString();
}

const CACHE_TTL_MS = 24 * 3600 * 1000; // 24 heures

async function getCache(blocType, societeId) {
  try {
    let query = admin().from('avocat_home_cache')
      .select('contenu, expires_at')
      .eq('bloc_type', blocType);
    if (societeId) {
      query = query.eq('societe_id', societeId);
    } else {
      query = query.is('societe_id', null);
    }
    const { data } = await query.single();
    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return data.contenu;
  } catch { return null; }
}

async function setCache(blocType, societeId, value) {
  try {
    const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    await admin().from('avocat_home_cache').upsert({
      societe_id: societeId || null,
      bloc_type: blocType,
      contenu: value,
      generated_at: new Date().toISOString(),
      expires_at: expires
    }, { onConflict: 'societe_id,bloc_type' });
  } catch (err) {
    console.error('[home-juridique] cache write error:', err.message);
  }
}

// ================================================
// GET /jurisprudence-semaine
// Décisions chambre sociale des 7 derniers jours + analyse IA
// ================================================
router.get('/jurisprudence-semaine', requireAvocat, async (req, res) => {
  try {
    const cached = await getCache('jurisprudence_semaine', null);
    if (cached) return res.json(cached);

    const dateStart = daysAgo(7);
    const dateEnd = daysAgo(0);

    let searchResult;
    try {
      searchResult = await judilibre.search('travail', {
        chambre: 'soc',
        dateDebut: dateStart,
        dateFin: dateEnd,
        pageSize: 10,
        sort: 'date',
        order: 'desc'
      });
    } catch (err) {
      console.error('[home-juridique] Judilibre search error:', err.message);
      return res.json({ decisions: [], message: 'Service Judilibre temporairement indisponible.' });
    }

    const decisions = (searchResult.results || []).slice(0, 5);

    const analysees = [];
    for (const dec of decisions) {
      try {
        const systemPrompt = `Vous êtes un expert en droit du travail français. Analysez cette décision de la Cour de cassation, chambre sociale. Répondez en JSON strict :
{
  "resume_faits": "Résumé des faits en 3 lignes maximum",
  "points_cles": ["Point clé 1", "Point clé 2"],
  "impact_pratique": "Impact pratique pour les avocats prud'homaux en 2 lignes",
  "score_importance": 3
}
Le score_importance est entre 1 et 5. Vouvoiement obligatoire. Pas d'émoji.`;

        const texteDecision = dec.text || dec.summary || dec.titre || '';
        const userPrompt = `Décision : ${dec.number || 'N/A'} du ${dec.date || 'date inconnue'}
Titre : ${dec.titre || 'Sans titre'}
Texte : ${texteDecision.substring(0, 3000)}`;

        const { result } = await dispatch('summarize_jurisprudence', systemPrompt, userPrompt, {
          maxTokens: 600
        });

        let analyse = {};
        try {
          const match = result.match(/\{[\s\S]*\}/);
          if (match) analyse = JSON.parse(match[0]);
        } catch { /* analyse reste vide */ }

        analysees.push({
          id: dec.id || null,
          numero: dec.number || null,
          date: dec.date || null,
          titre: dec.titre || 'Décision chambre sociale',
          chambre: 'sociale',
          resume_faits: analyse.resume_faits || 'Analyse non disponible.',
          points_cles: analyse.points_cles || [],
          impact_pratique: analyse.impact_pratique || '',
          score_importance: Math.min(5, Math.max(1, analyse.score_importance || 3))
        });
      } catch (err) {
        console.warn('[home-juridique] Analyse IA échouée pour', dec.id, err.message);
        analysees.push({
          id: dec.id || null,
          numero: dec.number || null,
          date: dec.date || null,
          titre: dec.titre || 'Décision chambre sociale',
          chambre: 'sociale',
          resume_faits: 'Analyse temporairement indisponible.',
          points_cles: [],
          impact_pratique: '',
          score_importance: 3
        });
      }
    }

    const result = {
      decisions: analysees,
      periode: { debut: dateStart, fin: dateEnd },
      total_trouvees: searchResult.total || decisions.length,
      generee_le: new Date().toISOString()
    };

    await setCache('jurisprudence_semaine', null, result);
    return res.json(result);
  } catch (err) {
    console.error('[home-juridique/jurisprudence-semaine]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /a-retenir
// Synthèse hebdomadaire des tendances jurisprudentielles
// ================================================
router.get('/a-retenir', requireAvocat, async (req, res) => {
  try {
    const cached = await getCache('a_retenir', req.societeId);
    if (cached) return res.json(cached);

    const { data: recentDecisions } = await admin().from('legal_data_cache')
      .select('data')
      .eq('source', 'judilibre')
      .order('updated_at', { ascending: false })
      .limit(20);

    const decisionsTexte = (recentDecisions || [])
      .map((row, i) => {
        const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        const titre = d.titre || d.numero || `Décision ${i + 1}`;
        const resume = d.resume_faits || d.summary || '';
        return `[${i + 1}] ${titre} : ${resume}`;
      })
      .join('\n');

    if (!decisionsTexte.trim()) {
      const result = {
        points: ['Aucune décision récente disponible pour cette semaine.'],
        generee_le: new Date().toISOString()
      };
      return res.json(result);
    }

    const systemPrompt = `Vous êtes un expert en droit social français. À partir des décisions récentes de la Cour de cassation, rédigez 5 à 7 points "à retenir" pour un avocat prud'homal.
Chaque point doit être concis (1-2 phrases), actionnable et pertinent.
Retournez un JSON strict : {"points":["Point 1","Point 2",...]}
Vouvoiement obligatoire. Pas d'émoji. Accents corrects.`;

    const userPrompt = `Voici les 20 dernières décisions de la chambre sociale :\n\n${decisionsTexte.substring(0, 4000)}`;

    const { result: iaResult } = await dispatch('summarize_jurisprudence', systemPrompt, userPrompt, {
      maxTokens: 800
    });

    let points = [];
    try {
      const match = iaResult.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        points = parsed.points || [];
      }
    } catch { /* points reste vide */ }

    if (!points.length) {
      points = ['La synthèse est temporairement indisponible. Veuillez réessayer ultérieurement.'];
    }

    const result = {
      points,
      nb_decisions_analysees: (recentDecisions || []).length,
      generee_le: new Date().toISOString()
    };

    await setCache('a_retenir', req.societeId, result);
    return res.json(result);
  } catch (err) {
    console.error('[home-juridique/a-retenir]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /alertes
// Agrégation multi-source des alertes urgentes
// ================================================
router.get('/alertes', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;
    const now = new Date();
    const dans7jours = new Date(now.getTime() + 7 * 86400000).toISOString();
    const il_y_a_48h = hoursAgo(48);
    const alertes = [];

    // 1. Deadlines proches (< 7 jours)
    try {
      const { data: dossiers } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, etape, date_audience, deadline_prochaine')
        .eq('avocat_societe_id', sid)
        .not('etape', 'in', '("clos","archive")');

      for (const d of (dossiers || [])) {
        if (d.deadline_prochaine && d.deadline_prochaine <= dans7jours && d.deadline_prochaine >= now.toISOString()) {
          const joursRestants = Math.ceil((new Date(d.deadline_prochaine).getTime() - now.getTime()) / 86400000);
          alertes.push({
            type: 'deadline',
            urgence: joursRestants <= 2 ? 'critique' : joursRestants <= 4 ? 'haute' : 'moyenne',
            titre: `Échéance dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`,
            description: `Dossier "${d.titre || d.reference}" — échéance le ${new Date(d.deadline_prochaine).toLocaleDateString('fr-FR')}`,
            dossier_id: d.id,
            date: d.deadline_prochaine,
            score_urgence: joursRestants <= 2 ? 100 : joursRestants <= 4 ? 80 : 60
          });
        }
        if (d.date_audience && d.date_audience <= dans7jours && d.date_audience >= now.toISOString()) {
          const joursRestants = Math.ceil((new Date(d.date_audience).getTime() - now.getTime()) / 86400000);
          alertes.push({
            type: 'audience',
            urgence: joursRestants <= 2 ? 'critique' : 'haute',
            titre: `Audience dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`,
            description: `Dossier "${d.titre || d.reference}" — audience le ${new Date(d.date_audience).toLocaleDateString('fr-FR')}`,
            dossier_id: d.id,
            date: d.date_audience,
            score_urgence: joursRestants <= 2 ? 100 : 90
          });
        }
      }
    } catch (err) {
      console.warn('[home-juridique/alertes] Erreur deadlines:', err.message);
    }

    // 2. Contradictions non résolues
    try {
      const { data: contradictions } = await admin().from('avocat_contradictions')
        .select('id, dossier_id, description, gravite, created_at')
        .eq('societe_id', sid)
        .eq('statut', 'detecte');

      for (const c of (contradictions || [])) {
        alertes.push({
          type: 'contradiction',
          urgence: c.gravite === 'critique' ? 'critique' : 'haute',
          titre: 'Contradiction détectée',
          description: c.description || 'Une contradiction a été détectée dans un dossier.',
          dossier_id: c.dossier_id,
          date: c.created_at,
          score_urgence: c.gravite === 'critique' ? 95 : 70
        });
      }
    } catch (err) {
      console.warn('[home-juridique/alertes] Erreur contradictions:', err.message);
    }

    // 3. Pièces manquantes priorité élevée
    try {
      const { data: pieces } = await admin().from('avocat_pieces_manquantes')
        .select('id, dossier_id, type_piece_attendue, priorite, created_at')
        .eq('societe_id', sid)
        .eq('priorite', 'elevee');

      for (const p of (pieces || [])) {
        alertes.push({
          type: 'piece_manquante',
          urgence: 'haute',
          titre: 'Pièce manquante prioritaire',
          description: `Pièce "${p.type_piece_attendue || 'non précisée'}" manquante dans un dossier.`,
          dossier_id: p.dossier_id,
          date: p.created_at,
          score_urgence: 65
        });
      }
    } catch (err) {
      console.warn('[home-juridique/alertes] Erreur pièces manquantes:', err.message);
    }

    // 4. Nouvelles jurisprudences pertinentes (dernières 48h)
    try {
      const { data: veille } = await admin().from('legal_veille_log')
        .select('id, titre, pertinence_score, dossier_id, created_at')
        .eq('societe_id', sid)
        .gte('created_at', il_y_a_48h)
        .order('pertinence_score', { ascending: false })
        .limit(5);

      for (const v of (veille || [])) {
        alertes.push({
          type: 'veille_jurisprudence',
          urgence: 'basse',
          titre: 'Nouvelle jurisprudence pertinente',
          description: v.titre || 'Décision potentiellement pertinente pour vos dossiers.',
          dossier_id: v.dossier_id,
          date: v.created_at,
          score_urgence: 30
        });
      }
    } catch (err) {
      console.warn('[home-juridique/alertes] Erreur veille:', err.message);
    }

    // Tri par score urgence décroissant
    alertes.sort((a, b) => b.score_urgence - a.score_urgence);

    return res.json({
      alertes,
      total: alertes.length,
      generee_le: new Date().toISOString()
    });
  } catch (err) {
    console.error('[home-juridique/alertes]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /dossiers-prioritaires
// Top 5 dossiers triés par score d'urgence pondéré
// ================================================
router.get('/dossiers-prioritaires', requireAvocat, async (req, res) => {
  try {
    const sid = req.societeId;
    const now = new Date();
    const dans14jours = new Date(now.getTime() + 14 * 86400000).toISOString();
    const dans7jours = new Date(now.getTime() + 7 * 86400000).toISOString();

    // Dossiers actifs
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('id, titre, reference, domaine, etape, date_audience, deadline_prochaine, client_id, created_at')
      .eq('avocat_societe_id', sid)
      .in('etape', ['en_cours', 'en_attente']);

    if (!dossiers || !dossiers.length) {
      return res.json({ dossiers: [] });
    }

    // Pièces manquantes élevées par dossier
    const dossierIds = dossiers.map(d => d.id);
    let piecesMap = {};
    try {
      const { data: pieces } = await admin().from('avocat_pieces_manquantes')
        .select('dossier_id')
        .eq('societe_id', sid)
        .eq('priorite', 'elevee')
        .in('dossier_id', dossierIds);
      for (const p of (pieces || [])) {
        piecesMap[p.dossier_id] = (piecesMap[p.dossier_id] || 0) + 1;
      }
    } catch { /* ignore */ }

    // Contradictions critiques par dossier
    let contradictionsMap = {};
    try {
      const { data: contras } = await admin().from('avocat_contradictions')
        .select('dossier_id, severite')
        .eq('societe_id', sid)
        .in('statut', ['detecte', 'en_cours'])
        .in('dossier_id', dossierIds);
      for (const c of (contras || [])) {
        if (c.severite === 'critique') {
          contradictionsMap[c.dossier_id] = (contradictionsMap[c.dossier_id] || 0) + 1;
        }
      }
    } catch { /* ignore */ }

    // Scoring
    const scored = dossiers.map(d => {
      let score = 0;

      // Audience dans < 14 jours (+50)
      if (d.date_audience && d.date_audience <= dans14jours && d.date_audience >= now.toISOString()) {
        score += 50;
      }

      // Deadline dans < 7 jours (+40)
      if (d.deadline_prochaine && d.deadline_prochaine <= dans7jours && d.deadline_prochaine >= now.toISOString()) {
        score += 40;
      }

      // Pièces manquantes élevées (+20)
      if (piecesMap[d.id]) {
        score += 20;
      }

      // Contradictions critiques (+30)
      if (contradictionsMap[d.id]) {
        score += 30;
      }

      return {
        id: d.id,
        titre: d.titre || d.reference || 'Sans titre',
        reference: d.reference || null,
        domaine: d.domaine || null,
        etape: d.etape,
        date_audience: d.date_audience || null,
        deadline_prochaine: d.deadline_prochaine || null,
        pieces_manquantes: piecesMap[d.id] || 0,
        contradictions_critiques: contradictionsMap[d.id] || 0,
        score_urgence: score
      };
    });

    // Top 5 triés par score décroissant
    scored.sort((a, b) => b.score_urgence - a.score_urgence);
    const top5 = scored.slice(0, 5);

    return res.json({
      dossiers: top5,
      generee_le: new Date().toISOString()
    });
  } catch (err) {
    console.error('[home-juridique/dossiers-prioritaires]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /tendances
// Statistiques thématiques sur 90 jours avec évolution
// ================================================
router.get('/tendances', requireAvocat, async (req, res) => {
  try {
    const cached = await getCache('tendances', null);
    if (cached) return res.json(cached);

    const il_y_a_90j = daysAgo(90);
    const il_y_a_180j = daysAgo(180);

    // Période actuelle (90 derniers jours)
    const { data: recent } = await admin().from('legal_data_cache')
      .select('data')
      .eq('source', 'judilibre')
      .gte('updated_at', il_y_a_90j);

    // Période précédente (90-180 jours)
    const { data: precedent } = await admin().from('legal_data_cache')
      .select('data')
      .eq('source', 'judilibre')
      .gte('updated_at', il_y_a_180j)
      .lt('updated_at', il_y_a_90j);

    const themes = [
      { mot_cle: 'licenciement', label: 'Licenciement' },
      { mot_cle: 'harcèlement', label: 'Harcèlement' },
      { mot_cle: 'heures supplémentaires', label: 'Heures supplémentaires' },
      { mot_cle: 'inaptitude', label: 'Inaptitude' },
      { mot_cle: 'discrimination', label: 'Discrimination' },
      { mot_cle: 'faute grave', label: 'Faute grave' }
    ];

    function countOccurrences(rows, keyword) {
      let count = 0;
      for (const row of (rows || [])) {
        const text = JSON.stringify(row.data || '').toLowerCase();
        if (text.includes(keyword.toLowerCase())) count++;
      }
      return count;
    }

    const tendances = themes.map(t => {
      const countRecent = countOccurrences(recent, t.mot_cle);
      const countPrecedent = countOccurrences(precedent, t.mot_cle);
      let evolution = 0;
      if (countPrecedent > 0) {
        evolution = Math.round(((countRecent - countPrecedent) / countPrecedent) * 100);
      } else if (countRecent > 0) {
        evolution = 100;
      }
      return {
        theme: t.label,
        mot_cle: t.mot_cle,
        count_90j: countRecent,
        count_precedent: countPrecedent,
        evolution_percent: evolution
      };
    });

    // Tri par count décroissant
    tendances.sort((a, b) => b.count_90j - a.count_90j);

    const result = {
      tendances,
      periode_actuelle: { debut: il_y_a_90j, fin: daysAgo(0) },
      periode_precedente: { debut: il_y_a_180j, fin: il_y_a_90j },
      total_decisions_analysees: (recent || []).length,
      generee_le: new Date().toISOString()
    };

    await setCache('tendances', null, result);
    return res.json(result);
  } catch (err) {
    console.error('[home-juridique/tendances]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
