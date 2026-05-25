'use strict';
/**
 * JADOMI Hook — auto-review.js
 * Called after Edit/Write tool use (PostToolUse hook).
 * Runs `node -c` on .js files to verify syntax.
 * Records syntax errors as learnings. Fast and lightweight.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

async function main() {
  try {
    const toolName = process.env.HOOK_TOOL || '';
    const inputRaw = process.env.HOOK_TOOL_INPUT || '{}';

    // Only process Edit and Write tools
    if (toolName !== 'Edit' && toolName !== 'Write') return;

    let input;
    try { input = JSON.parse(inputRaw); } catch { input = {}; }

    const filePath = input.file_path || input.path || null;
    if (!filePath) return;

    // Only check .js files
    if (!filePath.endsWith('.js')) return;

    // Run node -c (syntax check) — timeout 5s
    try {
      execSync('node -c ' + JSON.stringify(filePath), {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Syntax OK — no output needed
    } catch (syntaxErr) {
      const stderr = (syntaxErr.stderr || '').toString().substring(0, 500);
      const errorMsg = stderr || syntaxErr.message || 'Syntax error';

      // Output warning to stderr so Claude sees it
      console.error('[auto-review] SYNTAX ERROR in ' + filePath);
      console.error(errorMsg);

      // Record as error learning
      await sb().from('jadomi_learnings').insert({
        team: deriveTeam(filePath),
        type: 'error',
        title: 'Syntax error: ' + filePath.split('/').pop(),
        description: 'node -c failed on ' + filePath + ': ' + errorMsg.substring(0, 300),
        file_context: filePath,
        tags: ['syntax-error', 'auto-review'],
        confidence: 1.0,
        source_task_id: null,
      });

      // Exit with error code so the hook signals a problem
      process.exit(1);
    }

  } catch (e) {
    // Never crash the hook pipeline
    console.error('[auto-review] Hook error:', e.message);
  }
}

function deriveTeam(filePath) {
  if (filePath.includes('/api/')) return 'api';
  if (filePath.includes('/routes/')) return 'api';
  if (filePath.includes('/lib/boss/')) return 'boss';
  if (filePath.includes('/lib/')) return 'backend';
  return 'general';
}

main();
