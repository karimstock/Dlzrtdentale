// =============================================
// JADOMI — Legal RAG (Retrieval Augmented Generation)
// Enrichit les réponses IA avec des données juridiques réelles
// Recherche contextuelle Legifrance + Judilibre + mémoire dossier
// =============================================

const legifrance = require('./legifrance');
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
// EXTRACTION DE MOTS-CLÉS JURIDIQUES depuis une question
// ================================================
function extractLegalKeywords(text) {
  // Patterns juridiques français courants
  const patterns = [
    /article[s]?\s+[L\d][\d\-\.]+(?:\s+(?:du|de|des)\s+(?:Code|code)\s+[\w\s]+)?/gi,
    /(?:Cass|CA|CE|TJ|TGI|CPH)\.\s*[\w\s,\.]+\d{4}/gi,
    /n[°o]\s*[\d\-\.\/]+/gi,
    /(?:responsabilit[ée]|licenciement|r[ée]siliation|r[ée]solution|nullit[ée]|prescription|d[ée]lai|indemnit[ée]|pr[ée]judice|faute|dol|vice|contrat|bail|propri[ée]t[ée]|succession|divorce|garde|pension|cr[ée]ance|d[ée]biteur|cr[ée]ancier|hypoth[èe]que|servitude|usufruit|nantissement|gage|caution|solidarit[ée]|obligation|inexécution|force\s+majeure|cas\s+fortuit|bonne\s+foi|abus\s+de\s+droit|enrichissement\s+sans\s+cause)/gi
  ];

  const keywords = new Set();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => keywords.add(m.trim()));
    }
  }

  // Extraction simplifiée : mots de plus de 5 lettres hors stop words
  const stopWords = new Set(['cette', 'comme', 'aussi', 'alors', 'après', 'avant', 'avoir', 'entre',
    'faire', 'leurs', 'notre', 'votre', 'quand', 'quel', 'quelle', 'dans', 'avec', 'pour', 'plus',
    'tout', 'très', 'même', 'autre', 'encore', 'toujours', 'jamais', 'depuis', 'pendant', 'chaque',
    'quelque', 'certains', 'plusieurs', 'beaucoup', 'comment', 'pourquoi', 'analyse', 'question',
    'réponse', 'merci', 'bonjour', 'pouvez', 'pourriez', 'expliquer', 'donner', 'indiquer']);

  const words = text.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ\s]/g, ' ').split(/\s+/);
  words.filter(w => w.length > 5 && !stopWords.has(w)).slice(0, 5).forEach(w => keywords.add(w));

  return [...keywords].slice(0, 8);
}

// ================================================
// RECHERCHE CONTEXTUELLE — Enrichit une question avec des sources réelles
// ================================================
async function enrichWithLegalData(question, dossierContext = null) {
  const keywords = extractLegalKeywords(question);
  if (!keywords.length) return { sources: [], context: '' };

  const searchQuery = keywords.slice(0, 3).join(' ');
  const sources = [];
  let context = '';

  // Recherche parallèle dans les 3 sources
  const promises = [];

  // 1. Codes (Légifrance)
  promises.push(
    legifrance.searchCode(searchQuery, { pageSize: 3 })
      .then(data => {
        const results = data.results || [];
        results.forEach(r => {
          const sections = r.sections || [];
          sections.forEach(s => {
            (s.extracts || []).forEach(ex => {
              sources.push({
                type: 'code',
                code: r.titles?.[0]?.title || 'Code',
                article: ex.num || ex.title || '',
                texte: (ex.values || []).join(' ').replace(/<[^>]+>/g, '').substring(0, 500),
                etat: ex.legalStatus || 'VIGUEUR',
                id: ex.id
              });
            });
          });
        });
      })
      .catch(() => {})
  );

  // 2. Judilibre (décisions Cour de cassation)
  promises.push(
    judilibre.search(searchQuery, { pageSize: 3 })
      .then(data => {
        const results = data.results || [];
        results.forEach(r => {
          sources.push({
            type: 'judilibre',
            chambre: r.chamber || '',
            date: r.decision_date || '',
            numero: r.number || '',
            solution: r.solution || '',
            texte: (r.text || r.summary || '').substring(0, 500),
            id: r.id,
            jurisdiction: r.jurisdiction || 'cc'
          });
        });
      })
      .catch(() => {})
  );

  // 3. Jurisprudence Légifrance (JURI)
  promises.push(
    legifrance.searchJurisprudenceJudiciaire(searchQuery, { pageSize: 2 })
      .then(data => {
        const results = data.results || [];
        results.forEach(r => {
          const title = r.titles?.[0]?.title || '';
          sources.push({
            type: 'jurisprudence',
            titre: title,
            date: r.date || '',
            nature: r.nature || '',
            id: r.titles?.[0]?.id || ''
          });
        });
      })
      .catch(() => {})
  );

  // 4. Mémoire dossier (si contexte fourni)
  if (dossierContext?.dossierId) {
    promises.push(
      admin().from('legal_dossier_memory')
        .select('type, titre, contenu, score_pertinence, source_ref')
        .eq('dossier_id', dossierContext.dossierId)
        .order('score_pertinence', { ascending: false })
        .limit(5)
        .then(({ data }) => {
          (data || []).forEach(m => {
            sources.push({
              type: 'memoire_dossier',
              titre: m.titre,
              contenu: (m.contenu || '').substring(0, 300),
              pertinence: m.score_pertinence,
              ref: m.source_ref
            });
          });
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);

  // Construire le contexte pour l'IA
  if (sources.length > 0) {
    context = '\n\n--- SOURCES JURIDIQUES RÉELLES (Légifrance + Judilibre) ---\n';
    context += 'ATTENTION : cite UNIQUEMENT ces sources vérifiées. Ne génère JAMAIS de faux numéros d\'article ou de fausse jurisprudence.\n\n';

    sources.forEach((s, i) => {
      if (s.type === 'code') {
        context += `[SOURCE ${i + 1}] ${s.code} — Article ${s.article} (${s.etat})\n${s.texte}\n\n`;
      } else if (s.type === 'judilibre') {
        context += `[SOURCE ${i + 1}] Cass. ${s.chambre}, ${s.date}, n° ${s.numero} — ${s.solution}\n${s.texte}\n\n`;
      } else if (s.type === 'jurisprudence') {
        context += `[SOURCE ${i + 1}] ${s.titre} (${s.nature}, ${s.date})\n\n`;
      } else if (s.type === 'memoire_dossier') {
        context += `[MÉMOIRE DOSSIER] ${s.titre} (pertinence: ${s.pertinence}%)\n${s.contenu}\n\n`;
      }
    });

    context += '--- FIN DES SOURCES ---\n';
    context += 'Utilise ces sources pour enrichir ta réponse. Cite les articles et décisions exactement comme indiqué ci-dessus.\n';
  }

  return { sources, context, keywords };
}

// ================================================
// SAUVEGARDE en mémoire dossier — résultats pertinents
// ================================================
async function saveToMemory(dossierId, societeId, source) {
  try {
    await admin().from('legal_dossier_memory').upsert({
      dossier_id: dossierId,
      societe_id: societeId,
      type: source.type,
      titre: source.titre || source.article || source.numero || 'Référence',
      contenu: source.texte || source.contenu || '',
      source_ref: source.id || null,
      source_provider: source.type === 'judilibre' ? 'judilibre' : 'legifrance',
      score_pertinence: source.pertinence || 50,
      metadata: source
    }, {
      onConflict: 'dossier_id,source_ref',
      ignoreDuplicates: true
    });
  } catch (err) {
    console.error('[legal-rag/saveToMemory]', err.message);
  }
}

// ================================================
// VEILLE JURIDIQUE — Cherche nouvelles décisions pour un dossier
// ================================================
async function veilleJuridique(dossierId, societeId) {
  try {
    // Récupérer le dossier et ses mots-clés
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id, titre, domaine, veille_keywords')
      .eq('id', dossierId)
      .single();

    if (!dossier) return { nouvelles: 0, decisions: [] };

    const keywords = dossier.veille_keywords || [];
    if (!keywords.length) {
      // Auto-générer des mots-clés depuis le titre et le domaine
      const autoKeywords = extractLegalKeywords(
        (dossier.titre || '') + ' ' + (dossier.domaine || '')
      );
      if (autoKeywords.length) {
        await admin().from('avocat_dossiers')
          .update({ veille_keywords: autoKeywords })
          .eq('id', dossierId);
        keywords.push(...autoKeywords);
      }
    }

    if (!keywords.length) return { nouvelles: 0, decisions: [] };

    // Dernière veille
    const { data: lastVeille } = await admin().from('legal_veille_log')
      .select('checked_at')
      .eq('dossier_id', dossierId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single();

    const dateDebut = lastVeille?.checked_at
      ? lastVeille.checked_at.split('T')[0]
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const searchQuery = keywords.slice(0, 3).join(' ');
    const nouvelles = [];

    // Chercher dans Judilibre
    try {
      const result = await judilibre.search(searchQuery, {
        dateDebut,
        pageSize: 10,
        sort: 'date',
        order: 'desc'
      });

      for (const r of (result.results || [])) {
        nouvelles.push({
          type: 'judilibre',
          id: r.id,
          chambre: r.chamber,
          date: r.decision_date,
          numero: r.number,
          solution: r.solution,
          texte: (r.text || '').substring(0, 500),
          jurisdiction: r.jurisdiction
        });

        // Sauvegarder en mémoire dossier
        await saveToMemory(dossierId, societeId, {
          type: 'judilibre',
          titre: `Cass. ${r.chamber}, ${r.decision_date}, n° ${r.number}`,
          texte: (r.text || '').substring(0, 1000),
          id: r.id,
          pertinence: 60
        });
      }
    } catch (err) {
      console.error('[legal-rag/veille] Judilibre error:', err.message);
    }

    // Log la veille
    await admin().from('legal_veille_log').insert({
      dossier_id: dossierId,
      societe_id: societeId,
      keywords_used: keywords,
      results_count: nouvelles.length,
      checked_at: new Date().toISOString()
    });

    return { nouvelles: nouvelles.length, decisions: nouvelles };
  } catch (err) {
    console.error('[legal-rag/veille]', err.message);
    return { nouvelles: 0, decisions: [], error: err.message };
  }
}

// ================================================
// VEILLE GLOBALE — Pour tous les dossiers actifs d'un cabinet
// ================================================
async function veilleTousDossiers(societeId) {
  const { data: dossiers } = await admin().from('avocat_dossiers')
    .select('id')
    .eq('avocat_societe_id', societeId)
    .not('etape', 'in', '("clos","archive")');

  const resultats = [];
  for (const d of (dossiers || [])) {
    const r = await veilleJuridique(d.id, societeId);
    if (r.nouvelles > 0) {
      resultats.push({ dossier_id: d.id, ...r });
    }
  }

  return {
    dossiers_verifies: (dossiers || []).length,
    dossiers_avec_nouvelles: resultats.length,
    total_nouvelles: resultats.reduce((s, r) => s + r.nouvelles, 0),
    details: resultats
  };
}

module.exports = {
  extractLegalKeywords,
  enrichWithLegalData,
  saveToMemory,
  veilleJuridique,
  veilleTousDossiers
};
