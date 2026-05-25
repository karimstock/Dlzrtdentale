/**
 * JADOMI Boss — Cron Scheduler (setInterval-based)
 *
 * Vérifie toutes les 60s si une tâche planifiée est due,
 * puis l'insère dans jadomi_task_queue via Supabase.
 *
 * État persisté dans .cron-state.json (dernière exécution par nom).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const STATE_FILE = path.join(__dirname, '.cron-state.json');
const CHECK_INTERVAL = 60000; // 60s

let _sb = null;
function sb() {
  if (!_sb) {
    _sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _sb;
}

// === SCHEDULES ===
const SCHEDULES = [
  {
    name: 'Audit sécurité hebdo',
    team: 'security',
    cron: 'monday 9:00',
    prompt: 'Lance un audit sécurité complet : vérifie les headers HTTP, les dépendances vulnérables (npm audit), les permissions fichiers sensibles, les tokens exposés dans le code. Rapport concis avec actions correctives.',
    priority: 6
  },
  {
    name: 'Health check quotidien',
    team: 'ops',
    cron: 'daily 8:00',
    prompt: 'Vérifie : PM2 status de tous les process, espace disque (df -h), mémoire (free -m), charge CPU (uptime), certificats SSL, logs erreurs récents. Rapport concis.',
    priority: 4
  },
  {
    name: 'Rapport KPIs hebdo',
    team: 'finance',
    cron: 'friday 17:00',
    prompt: 'Génère un rapport KPI de la semaine : nombre de sessions utilisateur, tâches Boss complétées/échouées, tokens consommés, coût estimé, temps moyen par tâche. Format tableau.',
    priority: 5
  }
];

// === STATE PERSISTENCE ===
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[CRON] Erreur lecture état:', e.message);
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[CRON] Erreur sauvegarde état:', e.message);
  }
}

// === SCHEDULE MATCHING ===
function isDue(schedule, state) {
  const now = new Date();
  const lastRun = state[schedule.name] ? new Date(state[schedule.name]) : null;
  const cronDef = schedule.cron.toLowerCase().trim();

  // Parse "daily HH:MM"
  if (cronDef.startsWith('daily ')) {
    const [h, m] = cronDef.replace('daily ', '').split(':').map(Number);
    if (now.getHours() !== h || now.getMinutes() !== m) return false;
    // Already ran today?
    if (lastRun && isSameDay(lastRun, now)) return false;
    return true;
  }

  // Parse "monday|tuesday|...|friday|sunday HH:MM"
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const parts = cronDef.split(' ');
  if (parts.length === 2) {
    const dayIdx = days.indexOf(parts[0]);
    if (dayIdx >= 0) {
      if (now.getDay() !== dayIdx) return false;
      const [h, m] = parts[1].split(':').map(Number);
      if (now.getHours() !== h || now.getMinutes() !== m) return false;
      if (lastRun && isSameDay(lastRun, now)) return false;
      return true;
    }
  }

  return false;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// === INSERT TASK ===
async function insertCronTask(schedule) {
  try {
    const { data, error } = await sb().from('jadomi_task_queue').insert({
      team: schedule.team,
      title: '[CRON] ' + schedule.name,
      prompt: schedule.prompt,
      model: 'sonnet',
      priority: schedule.priority || 5,
      needs_approval: false,
      status: 'pending'
    }).select().single();

    if (error) {
      console.error('[CRON] Erreur insertion:', error.message);
      return null;
    }

    console.log(`[CRON] Tâche planifiée insérée: "${schedule.name}" (id=${data.id})`);
    return data;
  } catch (e) {
    console.error('[CRON] Erreur insertion:', e.message);
    return null;
  }
}

// === CHECK LOOP ===
let intervalId = null;

async function checkSchedules() {
  const state = loadState();
  const now = new Date();

  for (const schedule of SCHEDULES) {
    if (isDue(schedule, state)) {
      console.log(`[CRON] ${schedule.name} est dû — insertion dans la queue`);
      const task = await insertCronTask(schedule);
      if (task) {
        state[schedule.name] = now.toISOString();
        saveState(state);
      }
    }
  }
}

function start() {
  console.log(`[CRON] Démarré — ${SCHEDULES.length} planifications, check toutes les ${CHECK_INTERVAL / 1000}s`);
  // Check immediately at startup
  checkSchedules().catch(e => console.error('[CRON] Erreur check initial:', e.message));
  // Then every 60s
  intervalId = setInterval(() => {
    checkSchedules().catch(e => console.error('[CRON] Erreur check:', e.message));
  }, CHECK_INTERVAL);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[CRON] Arrêté');
  }
}

// === GETTERS FOR API ===
function getSchedules() {
  const state = loadState();
  return SCHEDULES.map(s => ({
    name: s.name,
    team: s.team,
    cron: s.cron,
    priority: s.priority,
    last_run: state[s.name] || null
  }));
}

function addSchedule(schedule) {
  if (!schedule.name || !schedule.cron || !schedule.prompt) {
    throw new Error('name, cron et prompt sont requis');
  }
  // Check for duplicate
  const existing = SCHEDULES.findIndex(s => s.name === schedule.name);
  if (existing >= 0) {
    // Update
    SCHEDULES[existing] = { ...SCHEDULES[existing], ...schedule };
  } else {
    SCHEDULES.push({
      name: schedule.name,
      team: schedule.team || 'dev',
      cron: schedule.cron,
      prompt: schedule.prompt,
      priority: schedule.priority || 5
    });
  }
  return getSchedules();
}

module.exports = {
  start,
  stop,
  getSchedules,
  addSchedule,
  SCHEDULES
};
