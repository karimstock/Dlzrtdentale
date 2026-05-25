'use strict';
/**
 * JADOMI Hook — learn-edit.js
 * Called after Edit/Write tool use via PostToolUse hook.
 * Records file edits in jadomi_learnings and detects co-edit patterns.
 * Lightweight — must complete in < 2 seconds.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

// Tag extraction (same logic as collective-memory.js)
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

async function main() {
  try {
    const toolName = process.env.HOOK_TOOL || '';
    const inputRaw = process.env.HOOK_TOOL_INPUT || '{}';

    let input;
    try { input = JSON.parse(inputRaw); } catch { input = {}; }

    // Extract file path from Edit or Write input
    const filePath = input.file_path || input.path || null;
    if (!filePath) return;

    // Derive team from file path
    const team = deriveTeam(filePath);
    const tags = extractTags(filePath + ' ' + (input.old_string || '') + ' ' + (input.new_string || '') + ' ' + (input.content || '').substring(0, 200));

    // Record the edit
    await sb().from('jadomi_learnings').insert({
      team: team,
      type: 'edit',
      title: toolName + ': ' + filePath.split('/').slice(-2).join('/'),
      description: buildDescription(toolName, input, filePath),
      file_context: filePath,
      tags: tags,
      confidence: 0.5,
      source_task_id: null,
    });

    // Detect co-edit patterns: check recent edits (last 10 min) for same session
    await detectCoEditPattern(filePath, team);

  } catch (e) {
    // Never crash — just log
    console.error('[learn-edit] Error:', e.message);
  }
}

function deriveTeam(filePath) {
  if (filePath.includes('/api/')) return 'api';
  if (filePath.includes('/routes/')) return 'api';
  if (filePath.includes('/lib/boss/')) return 'boss';
  if (filePath.includes('/lib/')) return 'backend';
  if (filePath.includes('/public/') || filePath.endsWith('.html')) return 'frontend';
  if (filePath.includes('/docs/')) return 'docs';
  if (filePath.endsWith('.sql')) return 'database';
  if (filePath.endsWith('.css')) return 'frontend';
  return 'general';
}

function buildDescription(toolName, input, filePath) {
  if (toolName === 'Edit') {
    const oldLen = (input.old_string || '').length;
    const newLen = (input.new_string || '').length;
    return 'Edit ' + filePath.split('/').pop() + ' (' + oldLen + ' -> ' + newLen + ' chars)';
  }
  if (toolName === 'Write') {
    const contentLen = (input.content || '').length;
    return 'Write ' + filePath.split('/').pop() + ' (' + contentLen + ' chars)';
  }
  return toolName + ' on ' + filePath.split('/').pop();
}

async function detectCoEditPattern(filePath, team) {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await sb().from('jadomi_learnings')
      .select('file_context')
      .eq('type', 'edit')
      .gte('created_at', tenMinAgo)
      .neq('file_context', filePath)
      .limit(10);

    if (!data || data.length < 2) return;

    // Get unique files edited recently
    const recentFiles = [...new Set(data.map(d => d.file_context).filter(Boolean))];
    if (recentFiles.length < 2) return;

    // Record co-edit pattern
    const coFiles = recentFiles.slice(0, 5);
    await sb().from('jadomi_learnings').insert({
      team: team,
      type: 'pattern',
      title: 'Co-edit: ' + [filePath, ...coFiles].map(f => f.split('/').pop()).join(' + '),
      description: 'Ces fichiers sont souvent modifies ensemble: ' + [filePath, ...coFiles].join(', '),
      file_context: filePath,
      tags: ['co-edit', team],
      confidence: 0.6,
      source_task_id: null,
    });
  } catch (e) {
    // Silent — pattern detection is optional
  }
}

main();
