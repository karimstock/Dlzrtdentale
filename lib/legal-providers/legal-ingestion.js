// =============================================
// JADOMI — Ingestion massive de jurisprudence
// Télécharge, résume et indexe des centaines de décisions
// depuis Judilibre dans la base Supabase
//
// But : l'IA a accès à des MILLIERS de principes juridiques
// pas 6 arrêts ridicules
//
// Coût : ~2€ pour 500 décisions (DeepSeek résumé)
// =============================================

const judilibre = require('./judilibre');
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

// ================================================
// INGESTION PAR THÈME — télécharge + résume + stocke
// ================================================
async function ingestTheme(theme, options = {}) {
  const maxDecisions = options.max || 50;
  const dateDebut = options.dateDebut || '2024-01-01';
  const log = { theme, started: new Date().toISOString(), fetched: 0, stored: 0, errors: [] };

  try {
    // 1. Chercher les décisions les plus récentes
    const result = await judilibre.search(theme, {
      chambre: 'soc',
      dateDebut,
      pageSize: Math.min(maxDecisions, 50),
      sort: 'date',
      order: 'desc'
    });

    const decisions = result.results || [];
    log.fetched = decisions.length;

    for (const d of decisions) {
      try {
        // 2. Récupérer le texte intégral
        let texte = d.text || '';
        if (!texte && d.id) {
          try {
            const full = await judilibre.getDecision(d.id);
            texte = full.text || '';
          } catch { /* pas bloquant */ }
        }

        if (texte.length < 100) continue;

        // 3. Extraire le principe juridique avec DeepSeek (ultra cheap)
        let principe = '';
        let motsCles = [];
        try {
          const { callDeepSeek } = require('./legal-ia-router');
          const system = 'Extrais le principe juridique retenu dans cette décision de la Cour de cassation. Retourne du JSON : {"principe":"...(2-3 phrases max)","mots_cles":["mot1","mot2"],"articles_cites":["L.1234-9","..."],"portee":"cassation|rejet|renvoi"}';
          const response = await callDeepSeek(system, texte.substring(0, 3000), { maxTokens: 300 });
          const match = response.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            principe = parsed.principe || '';
            motsCles = parsed.mots_cles || [];
          }
        } catch {
          // Fallback : prendre les 200 premiers caractères après "Attendu que" ou "Vu l'article"
          const idx = texte.indexOf('Attendu que');
          const idx2 = texte.indexOf('Vu l\'article');
          const start = Math.max(0, idx > 0 ? idx : idx2 > 0 ? idx2 : 200);
          principe = texte.substring(start, start + 300).replace(/\n/g, ' ').trim();
        }

        if (!principe) continue;

        // 4. Stocker en base
        const ref = 'Cass. soc. ' + (d.decision_date || '') + ', n° ' + (d.number || '');

        await admin().from('legal_data_cache').upsert({
          source: 'judilibre',
          external_id: d.id,
          query: theme,
          titre: ref,
          contenu_extrait: JSON.stringify({
            principe,
            mots_cles: motsCles,
            chambre: d.chamber,
            date: d.decision_date,
            numero: d.number,
            solution: d.solution,
            texte_extrait: texte.substring(0, 2000)
          }),
          metadata: { theme, ingested_at: new Date().toISOString() }
        }, { onConflict: 'source,external_id', ignoreDuplicates: false });

        log.stored++;

      } catch (err) {
        log.errors.push({ decision: d.id, error: err.message });
      }
    }
  } catch (err) {
    log.errors.push({ global: err.message });
  }

  log.finished = new Date().toISOString();
  log.duration_ms = new Date(log.finished) - new Date(log.started);
  return log;
}

// ================================================
// INGESTION MASSIVE — tous les thèmes droit du travail
// ================================================
async function ingestMassive(options = {}) {
  const maxParTheme = options.maxParTheme || 20;
  const dateDebut = options.dateDebut || '2024-01-01';

  const themes = [
    // Rupture du contrat
    'licenciement cause réelle sérieuse',
    'licenciement faute grave',
    'licenciement faute lourde',
    'licenciement économique',
    'insuffisance professionnelle',
    'inaptitude reclassement',
    'inaptitude accident travail',
    'rupture conventionnelle',
    'prise acte rupture',
    'résiliation judiciaire',

    // Indemnités et calculs
    'indemnité licenciement calcul',
    'barème macron indemnités',
    'préavis durée calcul',
    'congés payés indemnité compensatrice',
    'heures supplémentaires rappel',
    'salaire rappel créance',

    // Harcèlement et discrimination
    'harcèlement moral preuve',
    'harcèlement sexuel',
    'discrimination syndicale',
    'discrimination grossesse maternité',
    'égalité traitement rémunération',
    'obligation sécurité employeur',

    // Contrats spéciaux
    'CDD requalification CDI',
    'CDD rupture anticipée',
    'intérim requalification',
    'période essai rupture',
    'clause non concurrence',
    'clause mobilité',
    'modification contrat travail',

    // Temps de travail
    'forfait jours nullité',
    'temps partiel requalification',
    'astreinte compensation',
    'temps trajet travail effectif',

    // Représentants du personnel
    'salarié protégé licenciement',
    'élections CSE',
    'délit entrave',

    // Transfert d'entreprise
    'transfert entreprise L1224-1',
    'application volontaire convention collective',

    // Sanctions
    'sanction disciplinaire proportionnalité',
    'travail dissimulé indemnité',
    'prêt main oeuvre illicite'
  ];

  console.log('[ingestion] Lancement ingestion massive :', themes.length, 'thèmes,', maxParTheme, 'décisions/thème');

  const results = [];
  let totalStored = 0;

  for (const theme of themes) {
    try {
      const log = await ingestTheme(theme, { max: maxParTheme, dateDebut });
      results.push(log);
      totalStored += log.stored;
      console.log('[ingestion]', theme.substring(0, 35).padEnd(35), '→', log.stored, '/', log.fetched, 'stockées');

      // Pause 500ms entre chaque thème pour ne pas saturer l'API
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.push({ theme, error: err.message });
    }
  }

  const summary = {
    themes_traites: themes.length,
    total_fetched: results.reduce((s, r) => s + (r.fetched || 0), 0),
    total_stored: totalStored,
    total_errors: results.reduce((s, r) => s + (r.errors?.length || 0), 0),
    duree_totale_ms: results.reduce((s, r) => s + (r.duration_ms || 0), 0),
    details: results
  };

  console.log('[ingestion] TERMINÉ :', totalStored, 'décisions indexées sur', themes.length, 'thèmes');
  return summary;
}

// ================================================
// STATS — Combien de décisions en base
// ================================================
async function getIngestionStats() {
  const { data, error } = await admin().from('legal_data_cache')
    .select('source, query')
    .eq('source', 'judilibre');

  if (error) return { total: 0, error: error.message };

  const byTheme = {};
  (data || []).forEach(d => {
    const theme = d.query || 'inconnu';
    byTheme[theme] = (byTheme[theme] || 0) + 1;
  });

  return {
    total: (data || []).length,
    par_theme: byTheme,
    themes_couverts: Object.keys(byTheme).length
  };
}

module.exports = { ingestTheme, ingestMassive, getIngestionStats };
