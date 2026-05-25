'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CACHE_FILE = path.join(__dirname, '.file-index.json');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'data', 'uploads', '.claude',
  'dist', 'coverage', '.nyc_output', 'tmp', 'temp'
]);

const EXTENSIONS = new Set(['.js', '.html']);

let _indexCache = null;
let _indexCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Determine file category from its path relative to project root.
 */
function categorize(relPath) {
  if (relPath.startsWith('api/')) return 'apis';
  if (relPath.startsWith('routes/')) return 'routes';
  if (relPath.startsWith('lib/')) return 'libs';
  if (relPath.startsWith('public/') && relPath.endsWith('.html')) return 'pages';
  if (relPath.startsWith('scripts/')) return 'scripts';
  if (relPath.startsWith('sql/')) return 'configs';
  if (relPath.endsWith('.html') && !relPath.includes('/')) return 'pages';
  if (relPath === 'server.js' || relPath === 'package.json' || relPath.startsWith('.')) return 'configs';
  return 'other';
}

/**
 * Extract a short description from the first comment or derive from filename.
 */
function extractDescription(filePath, relPath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8', 0, bytesRead);

    // Try JSDoc or block comment
    const blockMatch = head.match(/\/\*\*?\s*\n?\s*\*?\s*(.{10,80})/);
    if (blockMatch) return blockMatch[1].replace(/\*\/.*/, '').replace(/\*\s*/, '').trim();

    // Try single-line comment at top
    const lineMatch = head.match(/^(?:#!.*\n)?(?:'use strict';\n)?\/\/\s*(.{10,80})/);
    if (lineMatch) return lineMatch[1].trim();

    // Try HTML title
    if (relPath.endsWith('.html')) {
      const titleMatch = head.match(/<title>(.{3,60})<\/title>/i);
      if (titleMatch) return titleMatch[1].trim();
    }
  } catch { /* ignore read errors */ }

  // Fallback: derive from filename
  const base = path.basename(relPath, path.extname(relPath));
  return base.replace(/[-_]/g, ' ');
}

/**
 * Recursively scan directory for .js and .html files.
 */
function scanDir(dir, relBase, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      scanDir(fullPath, relPath, results);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      // Skip backup files and temp files
      if (entry.name.includes('.bak') || entry.name.includes('.backup') || entry.name.includes('reviewer-backup')) {
        continue;
      }
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          path: relPath,
          size: stat.size,
          lastModified: stat.mtime.toISOString().slice(0, 10),
          type: categorize(relPath),
          description: extractDescription(fullPath, relPath)
        });
      } catch { /* skip unreadable files */ }
    }
  }
}

/**
 * Generate the full file index.
 */
function generateIndex() {
  const now = Date.now();
  if (_indexCache && (now - _indexCacheTime) < CACHE_TTL) {
    return _indexCache;
  }

  // Try to load from disk cache
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (cached._generatedAt && (now - cached._generatedAt) < CACHE_TTL) {
      _indexCache = cached;
      _indexCacheTime = cached._generatedAt;
      return cached;
    }
  } catch { /* no valid cache */ }

  const allFiles = [];
  scanDir(PROJECT_ROOT, '', allFiles);

  // Group by category
  const grouped = { apis: [], pages: [], libs: [], routes: [], configs: [], scripts: [], other: [] };
  for (const f of allFiles) {
    const cat = f.type;
    if (grouped[cat]) {
      grouped[cat].push(f);
    } else {
      grouped.other.push(f);
    }
  }

  // Sort each category by lastModified desc
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  }

  const index = {
    _generatedAt: now,
    _totalFiles: allFiles.length,
    ...grouped
  };

  // Persist to disk
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(index, null, 2));
  } catch { /* non-critical */ }

  _indexCache = index;
  _indexCacheTime = now;
  return index;
}

/**
 * Search for files matching keywords. Returns top 10 matches scored by relevance.
 */
function searchFiles(keywords) {
  if (!keywords || typeof keywords !== 'string') return [];

  const index = generateIndex();
  const terms = keywords.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const allFiles = [];
  for (const cat of ['apis', 'pages', 'libs', 'routes', 'configs', 'scripts', 'other']) {
    if (index[cat]) allFiles.push(...index[cat]);
  }

  const scored = allFiles.map(f => {
    let score = 0;
    const pathLower = f.path.toLowerCase();
    const descLower = (f.description || '').toLowerCase();

    for (const term of terms) {
      // Exact match in filename
      if (path.basename(pathLower).includes(term)) score += 10;
      // Match in path
      if (pathLower.includes(term)) score += 5;
      // Match in description
      if (descLower.includes(term)) score += 3;
    }
    return { ...f, _score: score };
  });

  return scored
    .filter(f => f._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...rest }) => rest);
}

/**
 * Get a compact text summary of the file index for context injection.
 */
function getIndexSummary() {
  const index = generateIndex();
  const lines = [
    `[JADOMI File Index] ${index._totalFiles} files indexed`,
    `APIs: ${index.apis.length} | Pages: ${index.pages.length} | Libs: ${index.libs.length} | Routes: ${index.routes.length}`
  ];
  // Top 5 recently modified per category
  for (const cat of ['apis', 'pages', 'libs']) {
    if (index[cat] && index[cat].length > 0) {
      lines.push(`Recent ${cat}: ${index[cat].slice(0, 5).map(f => f.path).join(', ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Force regeneration of the file index cache.
 */
function invalidateCache() {
  _indexCache = null;
  _indexCacheTime = 0;
  try { fs.unlinkSync(CACHE_FILE); } catch { /* ok */ }
}

module.exports = {
  generateIndex,
  searchFiles,
  getIndexSummary,
  invalidateCache
};
