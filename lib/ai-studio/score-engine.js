// =============================================
// JADOMI Studio — Score Engine
// Scoring dynamique des providers IA
// Couche d'optimisation AU-DESSUS des règles métier
// Le déterministe dit QUI peut, le scoring dit QUI le fait MIEUX
// =============================================

// --- Profils providers (statique, enrichi par l'historique) ---
const PROVIDER_PROFILES = {
  'openai-image': {
    types: ['image'],
    cost_per_unit: 0.08,       // USD moyen par génération
    avg_latency_ms: 8000,
    quality_base: 9,            // /10
    multimodal: true,
    europe_ok: false,           // serveurs US
    sensible_ok: false,         // données transitent US
    quota_par_minute: 50,
  },
  'openai-video': {
    types: ['video'],
    cost_per_unit: 0.40,
    avg_latency_ms: 30000,
    quality_base: 8,
    multimodal: true,
    europe_ok: false,
    sensible_ok: false,
    quota_par_minute: 5,
  },
  'openai-tts': {
    types: ['voice'],
    cost_per_unit: 0.015,
    avg_latency_ms: 3000,
    quality_base: 7,
    multimodal: false,
    europe_ok: false,
    sensible_ok: false,
    quota_par_minute: 50,
  },
  'elevenlabs': {
    types: ['voice'],
    cost_per_unit: 0.05,
    avg_latency_ms: 4000,
    quality_base: 9,
    multimodal: false,
    europe_ok: true,            // serveurs EU disponibles
    sensible_ok: true,
    quota_par_minute: 30,
  },
  'kling': {
    types: ['video', 'avatar', 'lip-sync'],
    cost_per_unit: 0.15,
    avg_latency_ms: 45000,
    quality_base: 8,
    multimodal: true,
    europe_ok: false,
    sensible_ok: false,
    quota_par_minute: 10,
  },
  'vidu': {
    types: ['video', 'lip-sync'],
    cost_per_unit: 0.06,
    avg_latency_ms: 35000,
    quality_base: 7,
    multimodal: true,
    europe_ok: false,
    sensible_ok: false,
    quota_par_minute: 10,
  },
  'gemini': {
    types: ['image', 'vision', 'detourage', 'texte'],
    cost_per_unit: 0.01,
    avg_latency_ms: 5000,
    quality_base: 7,
    multimodal: true,
    europe_ok: false,
    sensible_ok: false,
    quota_par_minute: 60,
  },
  'claude': {
    types: ['texte', 'redaction', 'logique'],
    cost_per_unit: 0.03,
    avg_latency_ms: 6000,
    quality_base: 10,
    multimodal: false,
    europe_ok: false,
    sensible_ok: true,          // meilleur contrôle données
    quota_par_minute: 40,
  },
  'deepseek': {
    types: ['texte', 'script', 'tache_simple'],
    cost_per_unit: 0.002,
    avg_latency_ms: 4000,
    quality_base: 6,
    multimodal: false,
    europe_ok: false,
    sensible_ok: false,         // JAMAIS données médicales sensibles
    quota_par_minute: 60,
  },
  'mistral': {
    types: ['texte', 'tache_simple'],
    cost_per_unit: 0.004,
    avg_latency_ms: 3000,
    quality_base: 7,
    multimodal: false,
    europe_ok: true,            // SOUVERAIN EUROPE
    sensible_ok: true,
    quota_par_minute: 60,
  },
  'remotion': {
    types: ['video_template'],
    cost_per_unit: 0.00,        // gratuit (self-hosted)
    avg_latency_ms: 15000,
    quality_base: 9,
    multimodal: false,
    europe_ok: true,            // self-hosted France
    sensible_ok: true,
    quota_par_minute: 999,
  },
  'removebg': {
    types: ['detourage'],
    cost_per_unit: 0.05,
    avg_latency_ms: 3000,
    quality_base: 9,
    multimodal: false,
    europe_ok: true,
    sensible_ok: true,
    quota_par_minute: 100,
  },
  'unsplash': {
    types: ['stock_image'],
    cost_per_unit: 0.00,
    avg_latency_ms: 1000,
    quality_base: 8,
    multimodal: false,
    europe_ok: true,
    sensible_ok: true,
    quota_par_minute: 50,
  },
  'pexels': {
    types: ['stock_image', 'stock_video'],
    cost_per_unit: 0.00,
    avg_latency_ms: 1000,
    quality_base: 7,
    multimodal: false,
    europe_ok: true,
    sensible_ok: true,
    quota_par_minute: 50,
  },
};

// --- Poids de scoring (ajustables) ---
const WEIGHTS = {
  cost:        0.25,  // 25% — le coût compte beaucoup
  quality:     0.25,  // 25% — la qualité aussi
  speed:       0.15,  // 15% — la vitesse
  reliability: 0.20,  // 20% — le taux de succès récent
  compliance:  0.15,  // 15% — RGPD / Europe / sensibilité
};

// --- Cache historique en mémoire (vidé toutes les heures) ---
let performanceCache = {};  // { 'provider:type': { success, fail, avg_ms, last_updated } }
let cacheExpiry = Date.now() + 3600000;

// ═══════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════

class ScoreEngine {

  /**
   * Choisit le meilleur provider pour une tâche donnée
   * @param {string} taskType - type de tâche (image, video, texte, detourage, voice, etc.)
   * @param {object} context - contexte de la requête
   * @param {string} context.quality - standard | premium | budget
   * @param {boolean} context.sensible - données médicales sensibles ?
   * @param {boolean} context.europe_required - conformité EU obligatoire ?
   * @param {string[]} context.allowed_providers - liste blanche (optionnel, du déterministe)
   * @param {string[]} context.blocked_providers - liste noire (optionnel)
   * @returns {{ provider: string, score: number, scores_detail: object, alternatives: array }}
   */
  static score(taskType, context = {}) {
    const candidates = this._filterCandidates(taskType, context);

    if (candidates.length === 0) {
      return { provider: null, score: 0, reason: 'no_provider_available' };
    }

    // Scorer chaque candidat
    const scored = candidates.map(name => {
      const profile = PROVIDER_PROFILES[name];
      const perf = this._getPerformance(name, taskType);
      const detail = {};

      // 1. Score coût (0-10, inversé : moins cher = mieux)
      const maxCost = 0.50;
      detail.cost = Math.max(0, 10 - (profile.cost_per_unit / maxCost) * 10);

      // Ajustement qualité demandée
      if (context.quality === 'budget') detail.cost *= 1.3;  // bonus coût pour budget
      if (context.quality === 'premium') detail.cost *= 0.7; // malus coût pour premium

      // 2. Score qualité (0-10)
      detail.quality = profile.quality_base;
      if (context.quality === 'premium' && profile.quality_base < 8) {
        detail.quality *= 0.7; // pénaliser les providers bas de gamme en mode premium
      }

      // 3. Score vitesse (0-10, inversé : plus rapide = mieux)
      const maxLatency = 60000;
      const effectiveLatency = perf.avg_ms || profile.avg_latency_ms;
      detail.speed = Math.max(0, 10 - (effectiveLatency / maxLatency) * 10);

      // 4. Score fiabilité (0-10, basé sur historique)
      if (perf.total > 0) {
        detail.reliability = (perf.success / perf.total) * 10;
      } else {
        detail.reliability = 7; // pas d'historique → score neutre
      }

      // Pénalité forte si échecs récents (dernière heure)
      if (perf.recent_fails >= 3) detail.reliability *= 0.3;
      else if (perf.recent_fails >= 1) detail.reliability *= 0.7;

      // 5. Score compliance (0-10)
      detail.compliance = 5; // neutre par défaut
      if (context.sensible && profile.sensible_ok) detail.compliance = 10;
      if (context.sensible && !profile.sensible_ok) detail.compliance = 0; // ÉLIMINATOIRE
      if (context.europe_required && profile.europe_ok) detail.compliance = 10;
      if (context.europe_required && !profile.europe_ok) detail.compliance = 0; // ÉLIMINATOIRE

      // Score final pondéré
      const finalScore =
        detail.cost       * WEIGHTS.cost +
        detail.quality    * WEIGHTS.quality +
        detail.speed      * WEIGHTS.speed +
        detail.reliability * WEIGHTS.reliability +
        detail.compliance * WEIGHTS.compliance;

      return {
        provider: name,
        score: Math.round(finalScore * 100) / 100,
        scores_detail: detail,
        profile,
      };
    });

    // Filtrer les scores éliminatoires (compliance = 0 quand obligatoire)
    const valid = scored.filter(s => {
      if (context.sensible && s.scores_detail.compliance === 0) return false;
      if (context.europe_required && s.scores_detail.compliance === 0) return false;
      return true;
    });

    if (valid.length === 0) {
      return { provider: null, score: 0, reason: 'no_compliant_provider' };
    }

    // Trier par score décroissant
    valid.sort((a, b) => b.score - a.score);

    return {
      provider: valid[0].provider,
      score: valid[0].score,
      scores_detail: valid[0].scores_detail,
      alternatives: valid.slice(1, 4).map(v => ({
        provider: v.provider,
        score: v.score,
      })),
      all_scores: valid, // pour debug
    };
  }

  /**
   * Filtre les candidats éligibles pour une tâche
   */
  static _filterCandidates(taskType, context) {
    let candidates = Object.keys(PROVIDER_PROFILES).filter(name => {
      const profile = PROVIDER_PROFILES[name];
      return profile.types.includes(taskType);
    });

    // Si le déterministe a pré-filtré
    if (context.allowed_providers && context.allowed_providers.length > 0) {
      candidates = candidates.filter(c => context.allowed_providers.includes(c));
    }

    // Exclusions
    if (context.blocked_providers) {
      candidates = candidates.filter(c => !context.blocked_providers.includes(c));
    }

    return candidates;
  }

  /**
   * Récupère les stats de performance d'un provider (cache mémoire)
   */
  static _getPerformance(providerName, taskType) {
    // Reset cache si expiré
    if (Date.now() > cacheExpiry) {
      performanceCache = {};
      cacheExpiry = Date.now() + 3600000;
    }

    const key = `${providerName}:${taskType}`;
    return performanceCache[key] || {
      success: 0,
      fail: 0,
      total: 0,
      avg_ms: 0,
      recent_fails: 0,
    };
  }

  /**
   * Enregistre le résultat d'un appel provider (après exécution)
   * Appelé par router.js après chaque génération
   */
  static recordResult(providerName, taskType, success, durationMs) {
    const key = `${providerName}:${taskType}`;

    if (!performanceCache[key]) {
      performanceCache[key] = {
        success: 0, fail: 0, total: 0, avg_ms: 0, recent_fails: 0,
      };
    }

    const perf = performanceCache[key];
    perf.total += 1;

    if (success) {
      perf.success += 1;
      perf.recent_fails = 0; // reset sur succès
      // Moyenne mobile exponentielle (α=0.3 pour réactivité)
      perf.avg_ms = perf.avg_ms === 0
        ? durationMs
        : Math.round(perf.avg_ms * 0.7 + durationMs * 0.3);
    } else {
      perf.fail += 1;
      perf.recent_fails += 1;
    }

    perf.last_updated = Date.now();
  }

  /**
   * Persiste les stats en Supabase (appelé périodiquement)
   */
  static async persistStats(supabase) {
    const entries = Object.entries(performanceCache);
    if (entries.length === 0) return;

    for (const [key, perf] of entries) {
      const [provider, task_type] = key.split(':');
      try {
        await supabase.from('studio_provider_stats').upsert({
          provider,
          task_type,
          total_calls: perf.total,
          success_count: perf.success,
          fail_count: perf.fail,
          avg_latency_ms: perf.avg_ms,
          success_rate: perf.total > 0 ? perf.success / perf.total : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider,task_type' });
      } catch (e) {
        console.error('[SCORE] persist error:', e.message);
      }
    }
  }

  /**
   * Charge les stats depuis Supabase au démarrage
   */
  static async loadStats(supabase) {
    try {
      const { data } = await supabase
        .from('studio_provider_stats')
        .select('*');

      if (data) {
        for (const row of data) {
          const key = `${row.provider}:${row.task_type}`;
          performanceCache[key] = {
            success: row.success_count || 0,
            fail: row.fail_count || 0,
            total: row.total_calls || 0,
            avg_ms: row.avg_latency_ms || 0,
            recent_fails: 0, // reset au redémarrage
          };
        }
        console.log(`[SCORE] ${data.length} stats chargées depuis Supabase`);
      }
    } catch (e) {
      console.warn('[SCORE] loadStats:', e.message);
    }
  }

  /**
   * Retourne un rapport lisible des scores pour une tâche
   * Utile pour debug et dashboard admin
   */
  static explain(taskType, context = {}) {
    const result = this.score(taskType, context);
    const lines = [`Score pour tâche "${taskType}":`];

    if (result.all_scores) {
      for (const s of result.all_scores) {
        const d = s.scores_detail;
        lines.push(
          `  ${s.provider.padEnd(15)} → ${s.score.toFixed(1)}/10  ` +
          `[coût:${d.cost.toFixed(1)} qual:${d.quality.toFixed(1)} ` +
          `vit:${d.speed.toFixed(1)} fiab:${d.reliability.toFixed(1)} ` +
          `rgpd:${d.compliance.toFixed(1)}]`
        );
      }
    }

    lines.push(`  → CHOIX: ${result.provider || 'AUCUN'} (${result.score.toFixed(1)})`);
    return lines.join('\n');
  }

  /**
   * Retourne les profils providers (pour dashboard admin)
   */
  static getProfiles() {
    return PROVIDER_PROFILES;
  }

  /**
   * Retourne le cache performance (pour dashboard admin)
   */
  static getPerformanceCache() {
    return { ...performanceCache };
  }
}

module.exports = ScoreEngine;
