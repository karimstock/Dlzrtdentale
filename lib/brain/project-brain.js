'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CODEX_PATH = path.join(PROJECT_ROOT, 'CODEX.md');
const CLAUDE_MD_PATH = path.join(PROJECT_ROOT, 'CLAUDE.md');

let _brainCache = null;
let _brainCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Parse the CODEX.md header to extract last passe description.
 */
function parseLastPasse(codexText) {
  const match = codexText.match(/\*\*Derniere passe\*\*\s*:\s*(.+)/);
  return match ? match[1].trim() : 'unknown';
}

/**
 * Parse the "Derniere mise a jour" date from CODEX header.
 */
function parseLastUpdate(codexText) {
  const match = codexText.match(/\*\*Derniere mise a jour\*\*\s*:\s*(.+)/);
  return match ? match[1].trim() : 'unknown';
}

/**
 * Extract module names and one-line descriptions from CODEX section 2.
 */
function parseModules(codexText) {
  const modules = [];
  const regex = /^## (2\.\d+)\s+(.+?)(?:\s*\(Passe \d+\))?$/gm;
  let m;
  while ((m = regex.exec(codexText)) !== null) {
    const num = m[1];
    let name = m[2].trim();
    // Clean trailing passe references
    name = name.replace(/\s*\(Passe\s*\d+.*?\)\s*$/, '').trim();
    modules.push(`${num} ${name}`);
  }
  return modules;
}

/**
 * Get current git branch.
 */
function getCurrentBranch() {
  try {
    return execSync('git -C ' + JSON.stringify(PROJECT_ROOT) + ' rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Extract critical rules from CLAUDE.md (max 5).
 */
function parseCriticalRules(claudeText) {
  const rules = [];
  // Key rules we know are critical
  const patterns = [
    { re: /Vouvoiement premium obligatoire/, rule: 'Vouvoiement premium obligatoire (chatbot, emails, UI)' },
    { re: /Zero emoji/, rule: 'Zero emoji dans messages utilisateurs' },
    { re: /NE JAMAIS CASSER.*SUPPRIMER/, rule: 'NE JAMAIS supprimer route/onglet/dashboard sans demande explicite' },
    { re: /Fichiers intouchables/, rule: 'Fichiers intouchables: mobile.html, api/rush.js, api/emailService.js, api/admin.js, routes/prothesistes.js, routes/commandes.js, .env' },
    { re: /karim_bahmed@yahoo\.fr.*ADMIN_EMAIL/, rule: 'Admin auth = karim_bahmed@yahoo.fr (jamais contact@jadomi.fr pour auth)' }
  ];
  for (const p of patterns) {
    if (p.re.test(claudeText)) {
      rules.push(p.rule);
    }
  }
  return rules.slice(0, 5);
}

/**
 * Generate the compressed brain JSON from CODEX.md and CLAUDE.md.
 */
function generateBrain() {
  const now = Date.now();
  if (_brainCache && (now - _brainCacheTime) < CACHE_TTL) {
    return _brainCache;
  }

  let codexText = '';
  try { codexText = fs.readFileSync(CODEX_PATH, 'utf8'); } catch { /* empty */ }

  let claudeText = '';
  try { claudeText = fs.readFileSync(CLAUDE_MD_PATH, 'utf8'); } catch { /* empty */ }

  const brain = {
    project: 'JADOMI',
    description: 'Plateforme SaaS B2B pour professionnels liberaux (sante, juridique, BTP, commerce) avec IA integree',
    last_update: parseLastUpdate(codexText),
    tech: {
      backend: 'Node.js + Express (PM2, port 3001)',
      frontend: 'HTML/CSS/JS vanilla',
      db: 'Supabase (PostgreSQL)',
      hosting: 'Ubuntu 22.04 VPS OVH (141.94.10.182)',
      storage: 'Cloudflare R2',
      ai: 'Claude API + OpenAI DALL-E 3 + Mistral + DeepSeek (catalogues only)',
      domain: 'https://jadomi.fr'
    },
    modules: parseModules(codexText),
    key_files: {
      server: 'server.js',
      main_pages: [
        'index.html (stock dashboard)',
        'organisation.html (admin multi-societes)',
        'landing.html (public landing)',
        'login.html', 'register.html',
        'commerce.html', 'billing.html',
        'wizard-societe.html', 'prothesiste.html',
        'sci.html', 'mobile.html'
      ],
      api_dirs: [
        'api/ (endpoints backend)',
        'api/avocat/', 'api/btp/', 'api/compta/',
        'api/copilot/', 'api/brain/', 'api/agenda-ia/',
        'api/connector/', 'api/studio/', 'api/multiSocietes/'
      ],
      lib_dirs: [
        'lib/ (core modules)',
        'lib/brain/', 'lib/agents/', 'lib/scrape-ia/',
        'lib/ia-secretary/', 'lib/workers/', 'lib/shipping/'
      ],
      routes: 'routes/labo/',
      sql: 'sql/ (migrations)',
      public: 'public/ (frontend static + landings)'
    },
    rules: parseCriticalRules(claudeText),
    current_branch: getCurrentBranch(),
    last_passe: parseLastPasse(codexText),
    admin_email: 'karim_bahmed@yahoo.fr'
  };

  _brainCache = brain;
  _brainCacheTime = now;
  return brain;
}

/**
 * Return brain as a compact text string (~500 tokens).
 */
function getBrainText() {
  const b = generateBrain();
  const lines = [
    `[JADOMI Brain] ${b.description}`,
    `Updated: ${b.last_update} | Branch: ${b.current_branch}`,
    `Last passe: ${b.last_passe}`,
    `Tech: ${b.tech.backend}, ${b.tech.frontend}, ${b.tech.db}, ${b.tech.hosting}, ${b.tech.storage}`,
    `AI: ${b.tech.ai}`,
    `Domain: ${b.tech.domain}`,
    `Admin: ${b.admin_email}`,
    ``,
    `Modules (${b.modules.length}):`,
    ...b.modules.map(m => `  - ${m}`),
    ``,
    `Key files: server.js, ${b.key_files.main_pages.slice(0, 5).join(', ')}`,
    `API dirs: ${b.key_files.api_dirs.slice(0, 6).join(', ')}`,
    `Lib dirs: ${b.key_files.lib_dirs.slice(0, 5).join(', ')}`,
    ``,
    `Rules:`,
    ...b.rules.map(r => `  ! ${r}`)
  ];
  return lines.join('\n');
}

/**
 * Return brain + relevant module info based on keywords in the task description.
 * Filters modules and key files to the most relevant ones.
 */
function getBrainForTask(taskDescription) {
  if (!taskDescription || typeof taskDescription !== 'string') {
    return getBrainText();
  }

  const brain = generateBrain();
  const task = taskDescription.toLowerCase();

  // Keyword to module/file mapping
  const keywordMap = {
    'avocat': { modules: ['juridique', 'avocat', 'wizard'], dirs: ['api/avocat/', 'lib/legal-providers/'] },
    'juridique': { modules: ['juridique', 'avocat'], dirs: ['api/avocat/', 'lib/legal-providers/'] },
    'dentiste': { modules: ['stock', 'gpo', 'timeline', 'cas-clinique'], dirs: ['api/dentiste-pro/', 'api/cas-clinique/'] },
    'stock': { modules: ['stock', 'inventaire', 'scanner'], dirs: ['api/', 'index.html'] },
    'gpo': { modules: ['gpo', 'queue', 'auction', 'fournisseur'], dirs: ['api/gpo/', 'lib/gpo-queue.js', 'lib/gpo-scheduler.js'] },
    'site': { modules: ['site', 'vitrine', 'wizard', 'cms'], dirs: ['api/sites/', 'wizard-societe.html'] },
    'landing': { modules: ['landing', 'metier'], dirs: ['landing.html', 'public/'] },
    'organisation': { modules: ['organisation', 'multi-societes', 'dashboard'], dirs: ['organisation.html', 'api/multiSocietes/'] },
    'copilot': { modules: ['copilot', 'brain', 'mail'], dirs: ['api/copilot/', 'api/brain/', 'lib/ia-secretary/'] },
    'email': { modules: ['email', 'mailing', 'smtp'], dirs: ['api/emailService.js', 'mailing.html', 'lib/emails/'] },
    'studio': { modules: ['studio', 'ads', 'pub'], dirs: ['api/studio/', 'api/ads/'] },
    'ide': { modules: ['ide', 'infirmier'], dirs: ['api/ide/'] },
    'compta': { modules: ['compta', 'comptabilite', 'scanner'], dirs: ['api/compta/'] },
    'btp': { modules: ['btp'], dirs: ['api/btp/', 'btp.html'] },
    'commerce': { modules: ['commerce'], dirs: ['api/multiSocietes/commerce.js', 'commerce.html'] },
    'sign': { modules: ['sign', 'signature'], dirs: ['lib/jadomi-sign.js', 'signature.html'] },
    'agenda': { modules: ['agenda', 'rdv', 'appointment'], dirs: ['api/agenda-ia/', 'api/appointments/'] },
    'coach': { modules: ['coach', 'onboarding', 'tour'], dirs: ['api/coach/', 'lib/coach/'] },
    'billing': { modules: ['billing', 'stripe', 'abonnement'], dirs: ['api/billing/', 'billing.html', 'checkout.html'] },
    'scrape': { modules: ['scrape', 'catalogue', 'fournisseur'], dirs: ['lib/scrape-ia/'] },
    'visio': { modules: ['visio', 'video'], dirs: ['lib/visio-signaling.js'] },
    'flutter': { modules: ['flutter', 'app', 'mobile'], dirs: ['jadomi-app/'] },
    'connector': { modules: ['connector', 'doctolib'], dirs: ['api/connector/', 'lib/connector/'] },
    'formation': { modules: ['formation', 'slides'], dirs: ['docs/formation/'] }
  };

  // Find matching keywords
  const matchedDirs = new Set();
  const matchedModuleKeywords = new Set();

  for (const [keyword, mapping] of Object.entries(keywordMap)) {
    if (task.includes(keyword)) {
      mapping.dirs.forEach(d => matchedDirs.add(d));
      mapping.modules.forEach(m => matchedModuleKeywords.add(m));
    }
  }

  // Filter modules if we have matches
  let relevantModules = brain.modules;
  if (matchedModuleKeywords.size > 0) {
    relevantModules = brain.modules.filter(mod => {
      const modLower = mod.toLowerCase();
      for (const kw of matchedModuleKeywords) {
        if (modLower.includes(kw)) return true;
      }
      return false;
    });
    // Always include at least 3 modules for context
    if (relevantModules.length < 3) {
      relevantModules = brain.modules.slice(0, 5);
    }
  }

  const lines = [
    `[JADOMI Brain — Task Context]`,
    `Task: ${taskDescription.substring(0, 120)}`,
    `Tech: ${brain.tech.backend}, ${brain.tech.frontend}, ${brain.tech.db}`,
    `Domain: ${brain.tech.domain} | Branch: ${brain.current_branch}`,
    `Admin: ${brain.admin_email}`,
    ``,
    `Relevant modules:`,
    ...relevantModules.map(m => `  - ${m}`),
    ``
  ];

  if (matchedDirs.size > 0) {
    lines.push(`Relevant paths:`);
    for (const d of matchedDirs) {
      lines.push(`  - ${d}`);
    }
    lines.push('');
  }

  lines.push(`Rules:`);
  brain.rules.forEach(r => lines.push(`  ! ${r}`));

  return lines.join('\n');
}

/**
 * Force regeneration of the brain cache.
 */
function invalidateCache() {
  _brainCache = null;
  _brainCacheTime = 0;
}

module.exports = {
  generateBrain,
  getBrainText,
  getBrainForTask,
  invalidateCache
};
