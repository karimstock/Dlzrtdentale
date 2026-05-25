// =============================================
// JADOMI BRAIN — Index des modules
// =============================================

const agents = require('./agents');
const mailScorer = require('./mail-scorer');
const mailSyncDaemon = require('./mail-sync-daemon');
const sessionMemory = require('./session-memory');
const projectBrain = require('./project-brain');
const fileIndex = require('./file-index');
let vectorStore; try { vectorStore = require('./vector-store'); } catch(e) { vectorStore = null; }
const contextRouter = require('./context-router');

module.exports = {
  agents,
  mailScorer,
  mailSyncDaemon,
  sessionMemory,

  // Project Brain — compressed CODEX summary for AI context injection
  projectBrain,
  generateBrain: projectBrain.generateBrain,
  getBrainText: projectBrain.getBrainText,
  getBrainForTask: projectBrain.getBrainForTask,

  // File Index — searchable project file map
  fileIndex,
  generateIndex: fileIndex.generateIndex,
  searchFiles: fileIndex.searchFiles,
  getIndexSummary: fileIndex.getIndexSummary,

  // Vector Store — pgvector embeddings for semantic code search
  vectorStore,
  indexFile: vectorStore ? vectorStore.indexFile : null,
  indexProject: vectorStore ? vectorStore.indexProject : null,
  searchSimilar: vectorStore ? vectorStore.searchSimilar : null,
  getVectorStats: vectorStore ? vectorStore.getStats : null,

  // Context Router — smart context injection for AI workers
  contextRouter,
  buildContext: contextRouter.buildContext,
  buildWorkerPrompt: contextRouter.buildWorkerPrompt,
  buildQuickContext: contextRouter.buildQuickContext,

  // Cache management
  invalidateAll() {
    projectBrain.invalidateCache();
    fileIndex.invalidateCache();
  }
};
