'use strict';

const projectBrain = require('./project-brain');
const fileIndex = require('./file-index');
let vectorStore;
try { vectorStore = require('./vector-store'); } catch (e) { vectorStore = null; }
let sessionMemory;
try { sessionMemory = require('./session-memory'); } catch (e) { sessionMemory = null; }

/**
 * Build optimized context for a worker task (~1500 tokens max)
 * Instead of injecting the full CODEX.md (5000+ tokens), we inject:
 * 1. Compressed project brain (~300 tokens)
 * 2. Relevant files for the task (~200 tokens)
 * 3. Key snippets from vector search (~500 tokens)
 * 4. Recent session context (~200 tokens)
 */
async function buildContext(taskDescription, options = {}) {
  const parts = [];

  // 1. Project Brain (compressed CODEX)
  try {
    const brainText = projectBrain.getBrainForTask
      ? projectBrain.getBrainForTask(taskDescription)
      : projectBrain.getBrainText();
    if (brainText) parts.push('[JADOMI BRAIN]\n' + brainText);
  } catch (e) {
    parts.push('[JADOMI BRAIN]\nProjet JADOMI — SaaS B2B sante/multi-secteurs. Node.js + Supabase. Dir: /home/ubuntu/jadomi');
  }

  // 2. Relevant files from file index
  try {
    const keywords = extractKeywords(taskDescription);
    const files = fileIndex.searchFiles(keywords.join(' '));
    if (files && files.length > 0) {
      const fileList = files.slice(0, 8).map(f =>
        '- ' + f.path + ' (' + f.type + ', ' + formatSize(f.size) + ')'
      ).join('\n');
      parts.push('[FICHIERS PERTINENTS]\n' + fileList);
    }
  } catch (e) { /* graceful */ }

  // 3. Vector search for relevant code snippets
  if (vectorStore && !options.skipVectors) {
    try {
      const chunks = await vectorStore.searchSimilar(taskDescription, 3);
      if (chunks && chunks.length > 0) {
        const snippets = chunks.map(function(c) {
          return '--- ' + c.file_path + ' ---\n' + (c.chunk_text || '').substring(0, 300);
        }).join('\n\n');
        parts.push('[EXTRAITS CODE]\n' + snippets);
      }
    } catch (e) { /* vector store not ready */ }
  }

  // 4. Recent session memory
  if (sessionMemory && !options.skipMemory) {
    try {
      const ctx = await sessionMemory.getSessionContext();
      if (ctx && ctx.length > 10) parts.push('[SESSIONS RECENTES]\n' + ctx);
    } catch (e) { /* no sessions yet */ }
  }

  return parts.join('\n\n');
}

/**
 * Build a complete worker prompt: context + task instruction
 */
async function buildWorkerPrompt(task, options = {}) {
  var prompt = (typeof task === 'string') ? task : (task.prompt || task.title || '');
  var context = await buildContext(prompt, options);

  var rules = [
    'Projet: /home/ubuntu/jadomi',
    'Admin email (auth): karim_bahmed@yahoo.fr',
    'Vouvoiement premium, zero emoji',
    'node -c obligatoire avant de terminer',
    'Ne JAMAIS modifier: mobile.html, api/rush.js, api/emailService.js, api/admin.js, .env'
  ].join('\n- ');

  return context + '\n\n[REGLES]\n- ' + rules + '\n\n[TACHE]\n' + prompt;
}

/**
 * Extract keywords from a task description for file search
 */
function extractKeywords(text) {
  var stopWords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'en',
    'dans', 'sur', 'pour', 'avec', 'par', 'au', 'aux', 'ce', 'cette', 'ces',
    'faut', 'peut', 'doit', 'aussi', 'bien', 'mais', 'comme', 'etre', 'avoir',
    'faire', 'fait', 'est', 'sont', 'pas', 'ne', 'plus', 'tout', 'qui', 'que'
  ]);
  return text.toLowerCase()
    .replace(/[^a-z\u00e0-\u00ff0-9\s\-_.\/]/g, ' ')
    .split(/\s+/)
    .filter(function(w) { return w.length > 2 && !stopWords.has(w); })
    .slice(0, 15);
}

function formatSize(bytes) {
  if (!bytes) return '?';
  if (bytes < 1024) return bytes + 'o';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + 'Ko';
  return (bytes / 1048576).toFixed(1) + 'Mo';
}

module.exports = { buildContext, buildWorkerPrompt, extractKeywords };
