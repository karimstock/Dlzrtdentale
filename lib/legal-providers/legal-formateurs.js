// =============================================
// JADOMI — Formateurs IA Juridiques
// Agents autonomes qui enrichissent la mémoire en continu
//
// 3 formateurs spécialisés :
// 1. VEILLEUR — Surveille Judilibre pour nouvelles décisions
// 2. INDEXEUR — Analyse et résume les décisions trouvées
// 3. CONNECTEUR — Croise les sources entre elles (jurisprudence chaînée)
//
// Coût : quasi-zéro (Ollama + DeepSeek pour 90% du travail)
// =============================================

const judilibre = require('./judilibre');
const legifrance = require('./legifrance');
const { callOllama, callDeepSeek, callMistral, callClaude } = require('./legal-ia-router');
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
// FORMATEUR 1 : VEILLEUR
// Cherche les nouvelles décisions pour chaque dossier actif
// Provider : Judilibre API (gratuit) + Ollama (0€) pour filtrage
// ================================================
async function formateurVeilleur(societeId) {
  const log = { formateur: 'veilleur', started: new Date().toISOString(), dossiers: 0, decisions: 0, saved: 0, errors: [] };

  try {
    // Récupérer tous les dossiers actifs avec keywords
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('id, titre, domaine, veille_keywords')
      .eq('avocat_societe_id', societeId)
      .not('etape', 'in', '("clos","archive")');

    if (!dossiers || !dossiers.length) {
      log.message = 'Aucun dossier actif';
      return log;
    }

    log.dossiers = dossiers.length;

    for (const dossier of dossiers) {
      try {
        const keywords = dossier.veille_keywords || [];
        if (!keywords.length) continue;

        // Dernière veille pour ce dossier
        const { data: lastLog } = await admin().from('legal_veille_log')
          .select('checked_at')
          .eq('dossier_id', dossier.id)
          .order('checked_at', { ascending: false })
          .limit(1)
          .single();

        const dateDebut = lastLog?.checked_at
          ? lastLog.checked_at.split('T')[0]
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Chercher dans Judilibre
        const searchQuery = keywords.slice(0, 3).join(' ');
        const result = await judilibre.search(searchQuery, {
          dateDebut,
          pageSize: 10,
          sort: 'date',
          order: 'desc'
        });

        const decisions = result.results || [];
        log.decisions += decisions.length;

        // Filtrer pertinence avec Ollama (0€)
        for (const d of decisions) {
          try {
            const prompt = `Ce dossier "${dossier.titre}" (${dossier.domaine || 'général'}) avec mots-clés [${keywords.join(', ')}].
Cette décision : Cass. ${d.chamber}, ${d.decision_date}, n° ${d.number} — ${d.solution}
Texte : ${(d.text || '').substring(0, 500)}
Est-ce pertinent ? Réponds UNIQUEMENT "OUI" ou "NON".`;

            let pertinent = true;
            try {
              const response = await callOllama(prompt, { maxTokens: 10 });
              pertinent = /oui/i.test(response);
            } catch {
              // Si Ollama down, on garde tout (safe)
              pertinent = true;
            }

            if (pertinent) {
              // Sauvegarder en mémoire dossier
              await admin().from('legal_dossier_memory').upsert({
                dossier_id: dossier.id,
                societe_id: societeId,
                type: 'judilibre',
                titre: `Cass. ${d.chamber}, ${d.decision_date}, n° ${d.number}`,
                contenu: (d.text || '').substring(0, 2000),
                source_ref: d.id,
                source_provider: 'veille',
                score_pertinence: 60,
                metadata: { chamber: d.chamber, date: d.decision_date, number: d.number, solution: d.solution }
              }, { onConflict: 'dossier_id,source_ref', ignoreDuplicates: true });

              log.saved++;
            }
          } catch (err) {
            log.errors.push({ dossier: dossier.id, decision: d.id, error: err.message });
          }
        }

        // Log veille
        await admin().from('legal_veille_log').insert({
          dossier_id: dossier.id,
          societe_id: societeId,
          keywords_used: keywords,
          results_count: decisions.length,
          checked_at: new Date().toISOString()
        });

      } catch (err) {
        log.errors.push({ dossier: dossier.id, error: err.message });
      }
    }
  } catch (err) {
    log.errors.push({ global: err.message });
  }

  log.finished = new Date().toISOString();
  return log;
}

// ================================================
// FORMATEUR 2 : INDEXEUR
// Résume et enrichit les décisions stockées en mémoire
// Provider : DeepSeek (0.14€/M, pas de données sensibles = OK pour jurisprudence publique)
// ================================================
async function formateurIndexeur(societeId) {
  const log = { formateur: 'indexeur', started: new Date().toISOString(), processed: 0, enriched: 0, errors: [] };

  try {
    // Trouver les décisions en mémoire sans résumé enrichi
    const { data: memories } = await admin().from('legal_dossier_memory')
      .select('id, titre, contenu, metadata, score_pertinence')
      .eq('societe_id', societeId)
      .in('type', ['judilibre', 'jurisprudence'])
      .is('validated_by', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!memories || !memories.length) {
      log.message = 'Aucune décision à indexer';
      return log;
    }

    for (const mem of memories) {
      try {
        log.processed++;

        if (!mem.contenu || mem.contenu.length < 50) continue;

        // Résumer avec DeepSeek (pas de données sensibles = jurisprudence publique)
        const system = `Résume cette décision de justice en 2-3 phrases. Identifie : 1) Le principe juridique retenu 2) La solution 3) Les articles de loi appliqués. Retourne du JSON : {"resume":"...","principe":"...","articles":["art. X du Code Y"],"mots_cles":["mot1","mot2"]}`;

        let enrichment;
        try {
          const result = await callDeepSeek(system, mem.contenu.substring(0, 3000), { maxTokens: 400 });
          const match = result.match(/\{[\s\S]*\}/);
          enrichment = match ? JSON.parse(match[0]) : null;
        } catch {
          // Fallback Mistral si DeepSeek fail
          try {
            const result = await callMistral(system, mem.contenu.substring(0, 3000), { maxTokens: 400, json: true });
            const match = result.match(/\{[\s\S]*\}/);
            enrichment = match ? JSON.parse(match[0]) : null;
          } catch { continue; }
        }

        if (enrichment) {
          // Mettre à jour la mémoire avec l'enrichissement
          const updatedMetadata = {
            ...(mem.metadata || {}),
            resume_ia: enrichment.resume,
            principe_juridique: enrichment.principe,
            articles_appliques: enrichment.articles,
            mots_cles_ia: enrichment.mots_cles,
            indexed_at: new Date().toISOString()
          };

          await admin().from('legal_dossier_memory')
            .update({
              metadata: updatedMetadata,
              score_pertinence: Math.min(100, (mem.score_pertinence || 50) + 10)
            })
            .eq('id', mem.id);

          log.enriched++;
        }
      } catch (err) {
        log.errors.push({ memory_id: mem.id, error: err.message });
      }
    }
  } catch (err) {
    log.errors.push({ global: err.message });
  }

  log.finished = new Date().toISOString();
  return log;
}

// ================================================
// FORMATEUR 3 : CONNECTEUR
// Croise les jurisprudences entre elles (chaînage)
// Trouve les décisions qui se citent mutuellement
// Provider : Ollama (0€) pour extraction de références
// ================================================
async function formateurConnecteur(societeId) {
  const log = { formateur: 'connecteur', started: new Date().toISOString(), analysed: 0, links_found: 0, errors: [] };

  try {
    // Récupérer les décisions enrichies mais pas encore connectées
    const { data: memories } = await admin().from('legal_dossier_memory')
      .select('id, dossier_id, titre, contenu, metadata')
      .eq('societe_id', societeId)
      .in('type', ['judilibre', 'jurisprudence'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (!memories || memories.length < 2) {
      log.message = 'Pas assez de décisions pour connecter';
      return log;
    }

    for (const mem of memories) {
      try {
        log.analysed++;

        const text = mem.contenu || '';
        if (text.length < 100) continue;

        // Extraire les références à d'autres décisions avec Ollama (0€)
        const prompt = `Extrais toutes les références à d'autres décisions de justice dans ce texte.
Retourne UNIQUEMENT un JSON : {"references":["Cass. civ. 1re, 12 mars 2024, n° 22-15.789",...]}.
Si aucune référence, retourne {"references":[]}.
Texte : ${text.substring(0, 2000)}`;

        let refs = [];
        try {
          const result = await callOllama(prompt, { maxTokens: 300 });
          const match = result.match(/\{[\s\S]*\}/);
          if (match) refs = JSON.parse(match[0]).references || [];
        } catch {
          continue;
        }

        if (refs.length > 0) {
          // Mettre à jour la métadata avec les connexions
          const updatedMeta = {
            ...(mem.metadata || {}),
            connected_decisions: refs,
            connected_at: new Date().toISOString()
          };

          await admin().from('legal_dossier_memory')
            .update({ metadata: updatedMeta })
            .eq('id', mem.id);

          log.links_found += refs.length;
        }
      } catch (err) {
        log.errors.push({ memory_id: mem.id, error: err.message });
      }
    }
  } catch (err) {
    log.errors.push({ global: err.message });
  }

  log.finished = new Date().toISOString();
  return log;
}

// ================================================
// SESSION COMPLÈTE — Lance les 3 formateurs en séquence
// ================================================
async function sessionFormation(societeId) {
  console.log('[formateurs] Début session formation pour société', societeId);
  const session = { started: new Date().toISOString(), formateurs: [] };

  // 1. Veilleur (cherche nouvelles décisions)
  const veilleur = await formateurVeilleur(societeId);
  session.formateurs.push(veilleur);
  console.log('[formateurs] Veilleur:', veilleur.decisions, 'décisions trouvées,', veilleur.saved, 'sauvegardées');

  // 2. Indexeur (enrichit les décisions)
  const indexeur = await formateurIndexeur(societeId);
  session.formateurs.push(indexeur);
  console.log('[formateurs] Indexeur:', indexeur.processed, 'traitées,', indexeur.enriched, 'enrichies');

  // 3. Connecteur (croise les sources)
  const connecteur = await formateurConnecteur(societeId);
  session.formateurs.push(connecteur);
  console.log('[formateurs] Connecteur:', connecteur.analysed, 'analysées,', connecteur.links_found, 'liens trouvés');

  session.finished = new Date().toISOString();
  session.duration_ms = new Date(session.finished) - new Date(session.started);

  console.log('[formateurs] Session terminée en', session.duration_ms, 'ms');
  return session;
}

// ================================================
// SESSION GLOBALE — Pour tous les cabinets avocats
// (appelé par le cron quotidien)
// ================================================
async function sessionFormationGlobale() {
  // Trouver tous les cabinets avec des dossiers avocat actifs
  const { data: societes } = await admin().from('avocat_dossiers')
    .select('avocat_societe_id')
    .not('etape', 'in', '("clos","archive")')
    .limit(100);

  const uniqueSocietes = [...new Set((societes || []).map(s => s.avocat_societe_id).filter(Boolean))];

  const results = [];
  for (const sid of uniqueSocietes) {
    try {
      const session = await sessionFormation(sid);
      results.push({ societe_id: sid, ...session });
    } catch (err) {
      results.push({ societe_id: sid, error: err.message });
    }
  }

  return {
    cabinets: uniqueSocietes.length,
    results
  };
}

module.exports = {
  formateurVeilleur,
  formateurIndexeur,
  formateurConnecteur,
  sessionFormation,
  sessionFormationGlobale
};
