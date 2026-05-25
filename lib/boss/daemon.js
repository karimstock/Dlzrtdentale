#!/usr/bin/env node
/**
 * JADOMI BOSS — Daemon autonome qui tourne en tmux 24/7
 *
 * Boucle: prend tâche → lance worker → vérifie → tâche suivante ou pause
 * Notifications email quand terminé ou besoin d'approbation
 *
 * Lancer: tmux new -s boss "node lib/boss/daemon.js"
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const POLL_INTERVAL = 10000; // 10s entre chaque check
const MAX_CONCURRENT = 2;    // max 2 workers en parallèle
const WORKER_TIMEOUT = 480000; // 8 min par worker
const REVIEW_TIMEOUT = 60000;  // 60s pour la review IA rapide

let brain;
try { brain = require('../brain'); } catch(e) { brain = null; }
const { buildTeamPrompt, getDefaultModel } = require('./teams');
const memory = require('./collective-memory');
const cron = require('./cron');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let running = 0;
let alive = true;

// === LOGGING ===
function log(msg) {
  const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${ts}] ${msg}`);
}

// === MAIN LOOP ===
async function loop() {
  log('BOSS daemon démarré — polling toutes les ' + (POLL_INTERVAL/1000) + 's');

  while (alive) {
    try {
      // Check for tasks needing work
      if (running < MAX_CONCURRENT) {
        const task = await pickTask();
        if (task) {
          running++;
          executeTask(task).finally(() => { running--; });
        }
      }
    } catch(e) {
      log('ERREUR boucle: ' + e.message);
    }

    await sleep(POLL_INTERVAL);
  }
}

// === PICK NEXT TASK ===
async function pickTask() {
  // Priority: pending tasks ordered by priority DESC, created_at ASC
  const { data, error } = await supabase
    .from('jadomi_task_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const task = data[0];

  // Mark as running
  await supabase.from('jadomi_task_queue').update({
    status: 'running',
    started_at: new Date().toISOString()
  }).eq('id', task.id);

  log(`PICKED: [${task.team}] "${task.title}" (priority ${task.priority})`);
  return task;
}

// === IA REVIEW (haiku, 60s max) ===
async function reviewResult(task, resultText) {
  try {
    const reviewPrompt = `Vérifie que le résultat est cohérent et complet. Le worker devait: ${task.title}. Résultat: ${(resultText || '').substring(0, 500)}. Réponds OK ou PROBLEME avec explication courte.`;
    const reviewResult = await runClaude(reviewPrompt, 'haiku', null, null, REVIEW_TIMEOUT);
    const answer = (reviewResult.text || '').trim();
    const hasProbleme = answer.toUpperCase().includes('PROBLEME');
    log(`REVIEW IA: [${task.team}] "${task.title}" → ${hasProbleme ? 'PROBLEME' : 'OK'} — ${answer.substring(0, 120)}`);
    return { ok: !hasProbleme, detail: answer.substring(0, 500) };
  } catch(e) {
    log(`REVIEW IA: timeout/erreur pour "${task.title}" — ${e.message} — on continue`);
    return { ok: true, detail: 'Review timeout — auto-OK' };
  }
}

// === EXECUTE TASK ===
async function executeTask(task) {
  const t0 = Date.now();
  const teamModel = task.model || getDefaultModel(task.team);

  // 1. Build team-qualified prompt
  let prompt = buildTeamPrompt(task.team, task.prompt);

  // 2. Inject Brain context (fichiers pertinents, état projet)
  if (brain && brain.buildContext) {
    try {
      const ctx = await brain.buildContext(task.prompt);
      prompt = ctx + '\n\n' + prompt;
    } catch(e) { /* fallback */ }
  }

  // 3. Inject collective memory (erreurs passées, succès, patterns)
  try {
    const memCtx = await memory.getRelevantLearnings(task.team, task.prompt, 3);
    if (memCtx) prompt = prompt + '\n\n' + memCtx;
  } catch(e) { /* no memory yet */ }

  log(`WORKER [${task.team}] démarré — modèle ${teamModel} — prompt ${prompt.length} chars`);

  try {
    const result = await runClaude(prompt, teamModel, task.id, task.parent_id);
    const duration = Date.now() - t0;

    // Decide: needs review or auto-approve
    if (task.needs_approval) {
      // Pause for human review
      await supabase.from('jadomi_task_queue').update({
        status: 'review',
        result_summary: result.text.substring(0, 2000),
        tokens_used: result.tokens,
        duration_ms: duration,
        completed_at: new Date().toISOString()
      }).eq('id', task.id);

      log(`REVIEW NEEDED: [${task.team}] "${task.title}" — en attente d'approbation`);
      await notifyEmail(task, 'review', result.text.substring(0, 500));

    } else {
      // IA Review before auto-approve
      const review = await reviewResult(task, result.text);

      if (!review.ok) {
        // IA detected a problem — escalate to human review
        await supabase.from('jadomi_task_queue').update({
          status: 'review',
          result_summary: result.text.substring(0, 2000),
          tokens_used: result.tokens,
          duration_ms: duration,
          completed_at: new Date().toISOString(),
          error: 'Review IA: ' + review.detail
        }).eq('id', task.id);

        log(`REVIEW IA ESCALADE: [${task.team}] "${task.title}" — problème détecté, en attente d'approbation`);
        await notifyEmail(task, 'review', 'Review IA a détecté un problème:\n' + review.detail + '\n\nRésultat du worker:\n' + result.text.substring(0, 400));

      } else {
        // Auto-approve
        await supabase.from('jadomi_task_queue').update({
          status: 'done',
          result_summary: result.text.substring(0, 2000),
          tokens_used: result.tokens,
          duration_ms: duration,
          completed_at: new Date().toISOString()
        }).eq('id', task.id);

        log(`DONE: [${task.team}] "${task.title}" — ${(duration/1000).toFixed(1)}s, ${result.tokens} tokens`);

        // Learn from success
        await memory.learnFromTask({ ...task, status: 'done' }, result.text);

        // Check for follow-up tasks (children with parent_id = this task)
        await checkFollowUp(task);
      }
    }

  } catch(e) {
    const duration = Date.now() - t0;
    const retryCount = task.retry_count || 0;

    // Auto-retry: si timeout et pas encore retried, re-queue avec prompt plus ciblé
    if (e.message.includes('Timeout') && retryCount < 1) {
      log(`RETRY: [${task.team}] "${task.title}" — timeout, re-queue avec prompt ciblé`);
      await supabase.from('jadomi_task_queue').update({
        status: 'pending',
        error: 'Retry après timeout — prompt simplifié',
        prompt: task.prompt + '\n\nIMPORTANT: La dernière tentative a timeout. Sois CONCIS. Ne lis que les parties pertinentes du fichier, pas tout. Fais UNE seule modification ciblée. Pas d\'analyse globale.',
        retry_count: retryCount + 1,
        started_at: null,
        completed_at: null,
      }).eq('id', task.id);
      await memory.learnFromTask({ ...task, status: 'failed', error: 'Timeout → retry' });
    } else {
      await supabase.from('jadomi_task_queue').update({
        status: 'failed',
        error: e.message,
        duration_ms: duration,
        completed_at: new Date().toISOString()
      }).eq('id', task.id);

      log(`FAILED: [${task.team}] "${task.title}" — ${e.message}`);
      await memory.learnFromTask({ ...task, status: 'failed', error: e.message });
      await notifyEmail(task, 'failed', e.message);
    }
  }
}

// === RUN CLAUDE CLI ===
function runClaude(prompt, model, taskId, parentId, timeoutMs) {
  const effectiveTimeout = timeoutMs || WORKER_TIMEOUT;
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--model', model || 'sonnet',
      '--max-budget-usd', '5',
      '--dangerously-skip-permissions',
    ];

    // Session persistence: each task gets its own session-id
    if (taskId) {
      args.push('--session-id', String(taskId));
    }

    // Resume parent session context for child tasks
    if (parentId) {
      args.push('--resume');
    }

    const child = spawn('claude', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, HOME: '/home/ubuntu', ANTHROPIC_API_KEY: '' },
      timeout: effectiveTimeout,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Timeout ' + (effectiveTimeout/1000) + 's'));
    }, effectiveTimeout);

    child.on('close', code => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout);
        resolve({
          text: data.result || stdout.substring(0, 2000),
          tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          cost: data.total_cost_usd || 0,
          model: Object.keys(data.modelUsage || {})[0] || model,
        });
      } catch(e) {
        if (code === 0 && stdout.length > 0) {
          resolve({ text: stdout.substring(0, 2000), tokens: 0, cost: 0, model });
        } else {
          reject(new Error('Exit ' + code + ': ' + (stderr || stdout).substring(0, 200)));
        }
      }
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// === CHECK FOLLOW-UP TASKS ===
async function checkFollowUp(parentTask) {
  // Find child tasks that were waiting on this parent
  const { data } = await supabase
    .from('jadomi_task_queue')
    .select('id, title')
    .eq('parent_id', parentTask.id)
    .eq('status', 'paused');

  if (data && data.length > 0) {
    for (const child of data) {
      await supabase.from('jadomi_task_queue').update({ status: 'pending' }).eq('id', child.id);
      log(`UNPAUSED: "${child.title}" — parent done`);
    }
  }
}

// === EMAIL NOTIFICATION ===
async function notifyEmail(task, type, details) {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ionos.fr',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: { user: process.env.SMTP_USER || 'noreply@jadomi.fr', pass: process.env.SMTP_PASS }
    });

    const subject = type === 'review'
      ? `[JADOMI Boss] Approbation requise — ${task.title}`
      : `[JADOMI Boss] Tâche échouée — ${task.title}`;

    const statusColor = type === 'review' ? '#c9a84c' : '#e53935';
    const statusText = type === 'review' ? 'En attente de votre approbation' : 'Erreur';

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:auto;padding:20px">
        <h2 style="color:${statusColor}">JADOMI Boss — ${statusText}</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#888;font-size:13px">Team</td><td style="padding:8px;font-weight:700">${task.team}</td></tr>
          <tr><td style="padding:8px;color:#888;font-size:13px">Tâche</td><td style="padding:8px">${task.title}</td></tr>
          <tr><td style="padding:8px;color:#888;font-size:13px">Statut</td><td style="padding:8px;color:${statusColor};font-weight:700">${statusText}</td></tr>
        </table>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-size:13px;white-space:pre-wrap">${(details || '').substring(0, 800)}</div>
        ${type === 'review' ? '<p style="margin-top:16px"><a href="https://jadomi.fr/code/" style="background:#c9a84c;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ouvrir JADOMI Code</a></p>' : ''}
      </div>`;

    await transporter.sendMail({
      from: '"JADOMI Boss" <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject,
      html
    });
    log(`EMAIL envoyé — ${subject}`);
  } catch(e) {
    log(`EMAIL erreur: ${e.message}`);
  }
}

// === GRACEFUL SHUTDOWN ===
process.on('SIGTERM', () => { alive = false; cron.stop(); log('SIGTERM — arrêt gracieux...'); });
process.on('SIGINT', () => { alive = false; cron.stop(); log('SIGINT — arrêt gracieux...'); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// === START ===
log('='.repeat(50));
log('  JADOMI BOSS v1.0');
log('  Daemon autonome multi-agents');
log('  Max workers: ' + MAX_CONCURRENT);
log('  Poll: ' + (POLL_INTERVAL/1000) + 's');
log('  Brain: ' + (brain ? 'OK' : 'non disponible'));
log('  Cron: démarrage...');
log('='.repeat(50));

cron.start();
loop().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
