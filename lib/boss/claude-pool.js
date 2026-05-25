'use strict';
/**
 * JADOMI Claude Pool — Processus Claude pré-démarrés pour réponse instantanée
 *
 * Au lieu de spawn('claude') à chaque requête (5s de boot),
 * on garde N processus claude en vie via --output-format stream-json
 * et on leur envoie des messages via stdin.
 *
 * Résultat: première réponse en <1s au lieu de 5-10s
 */

const { spawn } = require('child_process');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const POOL_SIZE = 2;
const IDLE_TIMEOUT = 300000; // 5 min sans activité → kill et respawn
const workers = [];

/**
 * Create a persistent Claude worker process
 */
function createWorker(model) {
  model = model || 'haiku';

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--max-budget-usd', '5',
    '--dangerously-skip-permissions',
  ];

  const child = spawn('claude', args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, HOME: '/home/ubuntu', ANTHROPIC_API_KEY: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const worker = {
    process: child,
    model,
    busy: false,
    ready: false,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    buffer: '',
    currentResolve: null,
    currentReject: null,
    currentResult: null,
    idleTimer: null,
  };

  // Parse stdout stream
  child.stdout.on('data', (chunk) => {
    worker.buffer += chunk.toString();
    const lines = worker.buffer.split('\n');
    worker.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleWorkerEvent(worker, event);
      } catch(e) { /* partial line */ }
    }
  });

  child.stderr.on('data', () => {}); // ignore stderr

  child.on('close', (code) => {
    worker.ready = false;
    if (worker.currentReject) {
      worker.currentReject(new Error('Process died: exit ' + code));
      worker.currentResolve = null;
      worker.currentReject = null;
    }
    // Remove from pool
    const idx = workers.indexOf(worker);
    if (idx >= 0) workers.splice(idx, 1);
  });

  child.on('error', (err) => {
    if (worker.currentReject) {
      worker.currentReject(err);
      worker.currentResolve = null;
      worker.currentReject = null;
    }
  });

  // Mark ready after init
  worker.ready = true;
  workers.push(worker);
  return worker;
}

function handleWorkerEvent(worker, event) {
  if (!worker.currentResult) return;

  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') worker.ready = true;
      break;

    case 'assistant':
      if (event.message?.content) {
        for (const part of event.message.content) {
          if (part.type === 'text' && part.text) {
            worker.currentResult.text += part.text;
            // Call stream callback if exists
            if (worker.currentResult.onChunk) {
              worker.currentResult.onChunk(part.text);
            }
          }
        }
        if (event.message.usage) {
          worker.currentResult.tokens = (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0);
        }
      }
      break;

    case 'result':
      if (event.result && !worker.currentResult.text) {
        worker.currentResult.text = event.result;
      }
      worker.currentResult.tokens = (event.usage?.input_tokens || 0) + (event.usage?.output_tokens || 0);
      worker.currentResult.cost = event.total_cost_usd || 0;
      worker.currentResult.model = Object.keys(event.modelUsage || {})[0] || worker.model;
      // Done — resolve
      if (worker.currentResolve) {
        worker.currentResolve(worker.currentResult);
        worker.currentResolve = null;
        worker.currentReject = null;
        worker.currentResult = null;
        worker.busy = false;
        worker.lastUsed = Date.now();
      }
      break;
  }
}

/**
 * Send a message to an available worker (or create one)
 * Returns a promise that resolves with { text, tokens, cost, model }
 */
function sendMessage(message, options) {
  options = options || {};
  const model = options.model || 'haiku';

  // Find available worker with matching model
  let worker = workers.find(w => !w.busy && w.ready && w.model === model);

  // Or any available worker
  if (!worker) worker = workers.find(w => !w.busy && w.ready);

  // Or create one
  if (!worker) {
    if (workers.length < POOL_SIZE * 2) {
      worker = createWorker(model);
    } else {
      // All busy — fallback to spawn
      return spawnFallback(message, model);
    }
  }

  worker.busy = true;
  worker.currentResult = { text: '', tokens: 0, cost: 0, model, onChunk: options.onChunk || null };

  return new Promise((resolve, reject) => {
    worker.currentResolve = resolve;
    worker.currentReject = reject;

    // Send message via stdin
    try {
      worker.process.stdin.write(message + '\n');
    } catch(e) {
      worker.busy = false;
      reject(e);
    }

    // Timeout
    const timeout = options.timeout || 120000;
    setTimeout(() => {
      if (worker.busy && worker.currentReject) {
        worker.busy = false;
        worker.currentReject(new Error('Pool timeout ' + (timeout/1000) + 's'));
        worker.currentResolve = null;
        worker.currentReject = null;
        worker.currentResult = null;
      }
    }, timeout);
  });
}

/**
 * Fallback: spawn a fresh process if pool is full
 */
function spawnFallback(message, model) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p', message,
      '--output-format', 'json',
      '--model', model || 'haiku',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, HOME: '/home/ubuntu', ANTHROPIC_API_KEY: '' },
      timeout: 120000,
    });

    let stdout = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.on('close', () => {
      try {
        const data = JSON.parse(stdout);
        resolve({ text: data.result || stdout.substring(0, 2000), tokens: 0, cost: 0, model });
      } catch(e) {
        resolve({ text: stdout.substring(0, 2000), tokens: 0, cost: 0, model });
      }
    });
    child.on('error', reject);
  });
}

/**
 * Initialize the pool
 */
function init() {
  for (let i = 0; i < POOL_SIZE; i++) {
    createWorker('haiku');
  }
  console.log(`[POOL] ${POOL_SIZE} workers haiku pré-démarrés`);
}

/**
 * Get pool stats
 */
function stats() {
  return {
    total: workers.length,
    busy: workers.filter(w => w.busy).length,
    ready: workers.filter(w => w.ready && !w.busy).length,
  };
}

/**
 * Shutdown pool
 */
function shutdown() {
  workers.forEach(w => {
    try { w.process.kill('SIGTERM'); } catch(e) {}
  });
  workers.length = 0;
}

module.exports = { init, sendMessage, stats, shutdown };
