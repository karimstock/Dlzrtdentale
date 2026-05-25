'use strict';
/**
 * JADOMI Collective Memory — Mémoire vivante qui apprend des succès et erreurs
 *
 * Chaque tâche terminée (succès ou échec) enrichit la mémoire.
 * Les prochains workers héritent de cette connaissance.
 * Le système s'améliore à chaque itération — il est VIVANT.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

/**
 * Record a learning — succès ou erreur — dans la mémoire collective
 */
async function recordLearning(entry) {
  try {
    await sb().from('jadomi_learnings').insert({
      team: entry.team || 'general',
      type: entry.type || 'info',        // success, error, pattern, rule, tip
      title: entry.title,
      description: entry.description,
      file_context: entry.file || null,
      tags: entry.tags || [],
      confidence: entry.confidence || 0.7, // 0-1 how reliable is this learning
      source_task_id: entry.taskId || null,
    });
  } catch(e) {
    console.log('[MEMORY] Record error:', e.message);
  }
}

/**
 * After a task completes, auto-extract learnings
 */
async function learnFromTask(task, result) {
  const learnings = [];

  if (task.status === 'done') {
    // Success — record what worked
    learnings.push({
      team: task.team,
      type: 'success',
      title: 'Tâche réussie: ' + task.title,
      description: (result || '').substring(0, 500),
      tags: extractTags(task.prompt + ' ' + (result || '')),
      confidence: 0.8,
      taskId: task.id,
    });

    // Extract file patterns if files were modified
    if (task.result_files && task.result_files.length > 0) {
      learnings.push({
        team: task.team,
        type: 'pattern',
        title: 'Fichiers modifiés ensemble: ' + task.result_files.slice(0, 5).join(', '),
        description: 'Ces fichiers sont souvent modifiés ensemble pour ce type de tâche (' + task.team + ')',
        tags: ['files', task.team],
        confidence: 0.6,
        taskId: task.id,
      });
    }
  }

  if (task.status === 'failed') {
    // Error — record what went wrong
    learnings.push({
      team: task.team,
      type: 'error',
      title: 'Échec: ' + task.title,
      description: 'Erreur: ' + (task.error || 'inconnue') + '\nPrompt: ' + (task.prompt || '').substring(0, 200),
      tags: extractTags(task.prompt + ' ' + (task.error || '')),
      confidence: 0.9,  // errors are very reliable learnings
      taskId: task.id,
    });
  }

  for (const l of learnings) {
    await recordLearning(l);
  }

  return learnings.length;
}

/**
 * Get relevant learnings for a new task (team + keywords)
 */
async function getRelevantLearnings(teamId, taskDescription, limit) {
  limit = limit || 5;
  try {
    // Get learnings for this team + general ones
    const { data } = await sb().from('jadomi_learnings')
      .select('type, title, description, confidence, created_at')
      .or('team.eq.' + teamId + ',team.eq.general')
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return '';

    // Score by relevance to task description
    const keywords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scored = data.map(l => {
      let score = l.confidence;
      const text = (l.title + ' ' + l.description).toLowerCase();
      for (const kw of keywords) {
        if (text.includes(kw)) score += 0.1;
      }
      return { ...l, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    if (top.length === 0) return '';

    const lines = top.map(l => {
      const icon = l.type === 'success' ? 'OK' : l.type === 'error' ? 'ERREUR' : 'INFO';
      return '- [' + icon + '] ' + l.title + (l.description ? ' — ' + l.description.substring(0, 100) : '');
    });

    return '[MEMOIRE COLLECTIVE]\n' + lines.join('\n');

  } catch(e) {
    return ''; // Table doesn't exist yet, graceful
  }
}

/**
 * Get stats on learnings
 */
async function getStats() {
  try {
    const { count: total } = await sb().from('jadomi_learnings').select('*', { count: 'exact', head: true });
    const { count: successes } = await sb().from('jadomi_learnings').select('*', { count: 'exact', head: true }).eq('type', 'success');
    const { count: errors } = await sb().from('jadomi_learnings').select('*', { count: 'exact', head: true }).eq('type', 'error');
    return { total: total || 0, successes: successes || 0, errors: errors || 0 };
  } catch(e) {
    return { total: 0, successes: 0, errors: 0 };
  }
}

/**
 * Extract tags from text
 */
function extractTags(text) {
  const tagMap = {
    'formation': 'formation', 'slide': 'formation', 'reveal': 'formation',
    'security': 'security', 'audit': 'security', 'owasp': 'security', 'rls': 'security',
    'legal': 'legal', 'cgv': 'legal', 'rgpd': 'legal', 'avocat': 'legal',
    'facture': 'finance', 'compta': 'finance', 'stripe': 'finance',
    'pm2': 'ops', 'deploy': 'ops', 'ssl': 'ops', 'nginx': 'ops',
    'seo': 'marketing', 'landing': 'marketing', 'email': 'marketing',
    'supabase': 'database', 'sql': 'database', 'table': 'database',
    'api': 'api', 'route': 'api', 'endpoint': 'api',
    'html': 'frontend', 'css': 'frontend', 'js': 'frontend',
    'scanner': 'dental', 'dentist': 'dental', 'camera': 'dental',
  };

  const found = new Set();
  const lower = text.toLowerCase();
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword)) found.add(tag);
  }
  return Array.from(found).slice(0, 8);
}

module.exports = { recordLearning, learnFromTask, getRelevantLearnings, getStats };
