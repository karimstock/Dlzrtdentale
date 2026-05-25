// =============================================
// JADOMI BRAIN — Session Memory
//
// Mémoire persistante entre sessions IA.
// Stocke dans Supabase : résumés, tâches, fichiers modifiés.
// Permet à chaque nouvelle session de reprendre le contexte.
//
// Table : jadomi_sessions (voir migration-sessions.sql)
// =============================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const TABLE = 'jadomi_sessions';
const DEFAULT_USER = 'karim_bahmed@yahoo.fr';

// Lazy Supabase client (service_role pour accès complet)
let _supabase = null;
function db() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _supabase;
}

// =============================================
// saveSession — Crée ou met à jour une session
// =============================================
async function saveSession(sessionData) {
  try {
    const record = {
      user_id: sessionData.user_id || DEFAULT_USER,
      session_name: sessionData.session_name || null,
      summary: sessionData.summary || null,
      tasks_completed: sessionData.tasks_completed || [],
      files_modified: sessionData.files_modified || [],
      context_snapshot: sessionData.context_snapshot || null,
      tokens_used: sessionData.tokens_used || 0,
      updated_at: new Date().toISOString()
    };

    // Si un id est fourni, on fait un upsert
    if (sessionData.id) {
      record.id = sessionData.id;
      const { data, error } = await db()
        .from(TABLE)
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    // Sinon, INSERT simple
    const { data, error } = await db()
      .from(TABLE)
      .insert(record)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    // Table n'existe pas encore => retourner null
    if (err.code === '42P01' || (err.message && err.message.includes('does not exist'))) {
      console.warn('[session-memory] Table jadomi_sessions non trouvée. Exécutez la migration.');
      return null;
    }
    console.error('[session-memory] saveSession error:', err.message);
    return null;
  }
}

// =============================================
// loadRecentSessions — Charge les N sessions récentes
// =============================================
async function loadRecentSessions(limit = 5) {
  try {
    const { data, error } = await db()
      .from(TABLE)
      .select('*')
      .eq('user_id', DEFAULT_USER)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    if (err.code === '42P01' || (err.message && err.message.includes('does not exist'))) {
      console.warn('[session-memory] Table jadomi_sessions non trouvée.');
      return [];
    }
    console.error('[session-memory] loadRecentSessions error:', err.message);
    return [];
  }
}

// =============================================
// getSessionContext — Résumé compressé (~200 tokens)
// pour injection dans le contexte d'une nouvelle session
// =============================================
async function getSessionContext() {
  try {
    const sessions = await loadRecentSessions(3);
    if (!sessions.length) return 'Aucune session précédente enregistrée.';

    const lines = sessions.map(s => {
      const date = new Date(s.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit'
      });
      const name = s.session_name ? ` (${s.session_name})` : '';
      const tasks = (s.tasks_completed || [])
        .filter(t => t.status === 'done' || t.status === 'completed')
        .map(t => t.title)
        .slice(0, 3)
        .join(', ');
      const files = (s.files_modified || []).slice(0, 5).join(', ');
      const summary = s.summary ? s.summary.slice(0, 120) : '';

      let line = `[${date}]${name}`;
      if (summary) line += ` ${summary}`;
      else if (tasks) line += ` Tâches: ${tasks}.`;
      if (files) line += ` Fichiers: ${files}.`;
      return line;
    });

    return `Sessions récentes:\n${lines.join('\n')}`;
  } catch (err) {
    console.error('[session-memory] getSessionContext error:', err.message);
    return 'Erreur récupération contexte sessions.';
  }
}

// =============================================
// summarizeAndSave — Résume les messages via Claude Haiku
// puis sauvegarde la session
// =============================================
async function summarizeAndSave(messages, sessionName) {
  try {
    // Extraire le texte pertinent des messages (limité pour ne pas exploser)
    const relevantText = messages
      .filter(m => m.role === 'assistant' || m.role === 'user')
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `[${m.role}] ${content.slice(0, 500)}`;
      })
      .slice(-20) // 20 derniers messages max
      .join('\n');

    // Prompt pour résumé compressé
    const prompt = `Résume cette session de développement en 2-3 phrases courtes en français.
Indique : ce qui a été fait, les fichiers modifiés, les problèmes résolus.
Format : texte brut, pas de markdown.

Session :
${relevantText.slice(0, 4000)}`;

    let summary = '';
    let tasksCompleted = [];
    let filesModified = [];

    // Appel Claude Haiku via CLI pour vitesse
    try {
      const escaped = prompt.replace(/'/g, "'\\''");
      const result = execSync(
        `echo '${escaped}' | claude -m claude-haiku-4 --no-input -p 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();
      summary = result || 'Résumé non disponible.';
    } catch (cliErr) {
      // Fallback : résumé basique extrait des messages
      summary = `Session "${sessionName || 'sans nom'}" — ${messages.length} messages échangés.`;
    }

    // Extraction basique des fichiers modifiés depuis les messages
    const filePattern = /(?:modifi[ée]|cr[ée]é|édité|touché|updated?|created?|edited?)\s+[:`]?([\/\w.\-]+\.\w{1,5})/gi;
    const allText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    let match;
    const filesSet = new Set();
    while ((match = filePattern.exec(allText)) !== null) {
      if (match[1] && match[1].length > 3) filesSet.add(match[1]);
    }
    filesModified = [...filesSet].slice(0, 30);

    // Extraction des tâches (heuristique)
    const taskPattern = /(?:✅|done|terminé|complété|fait)\s*:?\s*(.{5,80})/gi;
    while ((match = taskPattern.exec(allText)) !== null) {
      tasksCompleted.push({ title: match[1].trim(), status: 'done', files_modified: [] });
    }

    return saveSession({
      session_name: sessionName || null,
      summary,
      tasks_completed: tasksCompleted,
      files_modified: filesModified,
      context_snapshot: summary,
      tokens_used: Math.round(relevantText.length / 4) // Estimation grossière
    });
  } catch (err) {
    console.error('[session-memory] summarizeAndSave error:', err.message);
    // Sauvegarde minimale même en cas d'erreur
    return saveSession({
      session_name: sessionName || null,
      summary: `Session avec ${messages.length} messages (résumé échoué).`,
      tasks_completed: [],
      files_modified: [],
      tokens_used: 0
    });
  }
}

module.exports = {
  saveSession,
  loadRecentSessions,
  getSessionContext,
  summarizeAndSave
};
