'use strict';
/**
 * JADOMI Hook — learn-done.js
 * Called when a task completes. Reads task result from stdin or args.
 * Auto-generates a learning summary and saves to jadomi_learnings.
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

// Tag extraction (shared logic)
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
    'error': 'error', 'bug': 'error', 'fix': 'error', 'crash': 'error',
    'test': 'testing', 'spec': 'testing',
    'refactor': 'refactor', 'cleanup': 'refactor',
  };
  const found = new Set();
  const lower = text.toLowerCase();
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword)) found.add(tag);
  }
  return Array.from(found).slice(0, 8);
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), 2000); // 2s max wait
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
    // If stdin is not a pipe, resolve immediately
    if (process.stdin.isTTY) { clearTimeout(timer); resolve(''); }
  });
}

function detectType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('crash') || lower.includes('bug')) {
    return 'error';
  }
  return 'success';
}

function generateSummary(text) {
  // Extract first meaningful line as title
  const lines = text.split('\n').filter(l => l.trim().length > 5);
  const title = lines[0] || 'Task completed';

  // Truncate description
  const description = text.substring(0, 500);

  return { title: title.substring(0, 200), description };
}

async function main() {
  try {
    // Read from env vars (hook context) + stdin (task result)
    const hookEvent = process.env.HOOK_EVENT || '';
    const toolName = process.env.HOOK_TOOL || '';
    const outputRaw = process.env.HOOK_TOOL_OUTPUT || '';

    // Also accept from stdin or args
    const stdinData = await readStdin();
    const argData = process.argv.slice(2).join(' ');

    const content = stdinData || argData || outputRaw;
    if (!content || content.trim().length < 10) return;

    const type = detectType(content);
    const { title, description } = generateSummary(content);
    const tags = extractTags(content);

    // Derive team from tool context
    let team = 'general';
    try {
      const input = JSON.parse(process.env.HOOK_TOOL_INPUT || '{}');
      const filePath = input.file_path || input.path || '';
      if (filePath.includes('/api/') || filePath.includes('/routes/')) team = 'api';
      else if (filePath.includes('/lib/boss/')) team = 'boss';
      else if (filePath.includes('/lib/')) team = 'backend';
      else if (filePath.includes('/public/') || filePath.endsWith('.html')) team = 'frontend';
    } catch { /* ignore */ }

    await sb().from('jadomi_learnings').insert({
      team: team,
      type: type,
      title: title,
      description: description,
      file_context: null,
      tags: tags,
      confidence: type === 'error' ? 0.9 : 0.8,
      source_task_id: null,
    });

    if (type === 'error') {
      console.log('[learn-done] Erreur enregistree dans la memoire collective');
    }

  } catch (e) {
    console.error('[learn-done] Error:', e.message);
  }
}

main();
