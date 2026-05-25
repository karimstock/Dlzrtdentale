// =============================================
// JADOMI BRAIN — Vector Store (pgvector)
//
// Indexes project files into Supabase pgvector
// for semantic search by AI workers.
//
// Embedding strategy: deterministic hash-based
// 384-dim vectors from token frequencies (no
// external API needed). Upgrade path: swap
// generateEmbedding() for a real model later.
//
// V1 — practical, no over-engineering.
// =============================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- Supabase client (service_role for writes) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
function getClient() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for vector store');
    }
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// =============================================
// EMBEDDING — Hash-based 384-dim vectors
//
// Deterministic: same text => same vector.
// Uses token hashing + TF normalization.
// Good enough for keyword-semantic hybrid search.
// Replace with a real model (e.g. all-MiniLM-L6)
// when needed.
// =============================================

const EMBEDDING_DIM = 384;

/**
 * Simple hash function for strings
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Tokenize text into meaningful tokens
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿçæœ_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && t.length < 40);
}

/**
 * Generate a 384-dim embedding from text using token hashing.
 * Each token maps to multiple dimensions via hash, then L2-normalize.
 */
function generateEmbedding(text) {
  const tokens = tokenize(text);
  const vec = new Float32Array(EMBEDDING_DIM);

  // Token frequency hashing into dimensions
  for (const token of tokens) {
    const h = Math.abs(hashCode(token));
    // Map each token to 3 dimensions for better coverage
    for (let k = 0; k < 3; k++) {
      const idx = (h + k * 127) % EMBEDDING_DIM;
      const sign = ((h >> (k + 3)) & 1) ? 1 : -1;
      vec[idx] += sign;
    }
  }

  // Bigram features for phrase sensitivity
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = tokens[i] + '_' + tokens[i + 1];
    const h = Math.abs(hashCode(bigram));
    const idx = h % EMBEDDING_DIM;
    const sign = (h & 2) ? 0.5 : -0.5;
    vec[idx] += sign;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    result.push(Math.round((vec[i] / norm) * 1000000) / 1000000);
  }

  return result;
}

// =============================================
// CHUNKING — Split files into ~500 char chunks
// =============================================

/**
 * Split text into chunks of roughly targetSize characters,
 * breaking at line boundaries when possible.
 */
function chunkText(text, targetSize = 500) {
  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > targetSize && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

// =============================================
// VECTOR STORE OPERATIONS
// =============================================

/**
 * Check if the code_embeddings table exists
 */
async function tableExists() {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('code_embeddings')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Index a single file: read, chunk, embed, upsert.
 * @param {string} filePath - absolute or relative path
 * @param {object} opts - { basePath: project root for relative paths }
 */
async function indexFile(filePath, opts = {}) {
  const basePath = opts.basePath || '/home/ubuntu/jadomi';
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
  const relPath = path.relative(basePath, absPath);

  if (!fs.existsSync(absPath)) {
    return { indexed: false, reason: 'file not found', path: relPath };
  }

  const stat = fs.statSync(absPath);
  if (stat.size > 500000) {
    return { indexed: false, reason: 'file too large (>500KB)', path: relPath };
  }

  let content;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch (err) {
    return { indexed: false, reason: err.message, path: relPath };
  }

  if (!content.trim()) {
    return { indexed: false, reason: 'empty file', path: relPath };
  }

  const ext = path.extname(absPath).toLowerCase();
  const chunks = chunkText(content);
  const client = getClient();

  // Delete existing chunks for this file
  await client
    .from('code_embeddings')
    .delete()
    .eq('file_path', relPath);

  // Insert new chunks
  const rows = chunks.map((chunk, idx) => ({
    file_path: relPath,
    chunk_text: chunk,
    chunk_index: idx,
    embedding: JSON.stringify(generateEmbedding(chunk)),
    metadata: {
      ext,
      size: stat.size,
      lines: content.split('\n').length,
      total_chunks: chunks.length,
      indexed_at: new Date().toISOString()
    }
  }));

  // Batch insert (Supabase handles up to 1000 rows)
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client
      .from('code_embeddings')
      .insert(batch);
    if (error) {
      console.error(`[vector-store] Insert error for ${relPath} batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  return { indexed: true, path: relPath, chunks: inserted };
}

/**
 * Search for similar chunks using vector similarity.
 * Falls back to keyword search if vector search fails.
 */
async function searchSimilar(query, limit = 5) {
  const client = getClient();

  // Try vector search first
  try {
    const queryEmbedding = generateEmbedding(query);
    const { data, error } = await client.rpc('match_code_embeddings', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.1,
      match_count: limit
    });

    if (!error && data && data.length > 0) {
      return data.map(r => ({
        file_path: r.file_path,
        chunk_text: r.chunk_text,
        chunk_index: r.chunk_index,
        similarity: Math.round(r.similarity * 1000) / 1000,
        metadata: r.metadata
      }));
    }
  } catch (err) {
    console.warn('[vector-store] Vector search failed, falling back to keyword:', err.message);
  }

  // Fallback: keyword search using Supabase text search
  return keywordSearch(query, limit);
}

/**
 * Keyword-based fallback search using ilike on chunk_text
 */
async function keywordSearch(query, limit = 5) {
  const client = getClient();
  const keywords = tokenize(query).slice(0, 5); // top 5 keywords

  if (keywords.length === 0) return [];

  // Search for any keyword match
  let queryBuilder = client
    .from('code_embeddings')
    .select('file_path, chunk_text, chunk_index, metadata')
    .limit(limit);

  // Use OR filter for keywords
  const orFilters = keywords.map(kw => `chunk_text.ilike.%${kw}%`).join(',');
  queryBuilder = queryBuilder.or(orFilters);

  const { data, error } = await queryBuilder;

  if (error) {
    console.error('[vector-store] Keyword search error:', error.message);
    return [];
  }

  return (data || []).map(r => ({
    file_path: r.file_path,
    chunk_text: r.chunk_text,
    chunk_index: r.chunk_index,
    similarity: 0, // keyword match, no score
    metadata: r.metadata
  }));
}

/**
 * Index all important project files.
 * Targets: JS (api, lib, routes), key HTML files.
 */
async function indexProject(opts = {}) {
  const basePath = opts.basePath || '/home/ubuntu/jadomi';
  const exists = await tableExists();
  if (!exists) {
    return { success: false, error: 'code_embeddings table not found. Run migration-vectors.sql first.' };
  }

  const results = { indexed: 0, skipped: 0, errors: 0, files: [] };

  // Key directories to index
  const dirs = [
    'api',
    'lib',
    'routes',
    'lib/brain',
    'lib/agents',
    'lib/ai-studio',
    'lib/legal-providers',
    'lib/emails',
    'lib/workers'
  ];

  // Key root files
  const rootFiles = [
    'server.js',
    'CODEX.md',
    'CLAUDE.md'
  ];

  // Collect files
  const filesToIndex = [];

  // Root files
  for (const f of rootFiles) {
    const fp = path.join(basePath, f);
    if (fs.existsSync(fp)) filesToIndex.push(f);
  }

  // Directory files (js, html — skip node_modules, data, backups)
  for (const dir of dirs) {
    const dirPath = path.join(basePath, dir);
    if (!fs.existsSync(dirPath)) continue;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.js', '.html', '.md'].includes(ext)) continue;
        if (entry.name.includes('.bak') || entry.name.includes('backup')) continue;

        filesToIndex.push(path.join(dir, entry.name));
      }
    } catch (err) {
      console.warn(`[vector-store] Cannot read dir ${dir}:`, err.message);
    }
  }

  // Index each file (sequential to avoid overwhelming Supabase)
  for (const filePath of filesToIndex) {
    try {
      const result = await indexFile(filePath, { basePath });
      if (result.indexed) {
        results.indexed++;
        results.files.push({ path: result.path, chunks: result.chunks });
      } else {
        results.skipped++;
      }
    } catch (err) {
      results.errors++;
      console.error(`[vector-store] Error indexing ${filePath}:`, err.message);
    }
  }

  console.log(`[vector-store] Project indexed: ${results.indexed} files, ${results.skipped} skipped, ${results.errors} errors`);
  return { success: true, ...results };
}

/**
 * Get stats about the vector store
 */
async function getStats() {
  const client = getClient();
  try {
    const { count, error } = await client
      .from('code_embeddings')
      .select('*', { count: 'exact', head: true });

    if (error) return { available: false, error: error.message };

    const { data: files } = await client
      .from('code_embeddings')
      .select('file_path')
      .limit(1000);

    const uniqueFiles = new Set((files || []).map(f => f.file_path));

    return {
      available: true,
      totalChunks: count || 0,
      uniqueFiles: uniqueFiles.size
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

module.exports = {
  generateEmbedding,
  chunkText,
  tokenize,
  indexFile,
  searchSimilar,
  keywordSearch,
  indexProject,
  tableExists,
  getStats,
  EMBEDDING_DIM
};
