#!/usr/bin/env node
// =============================================
// JADOMI — DeepSeek normalise TOUS les produits
//
// Batch de 50 produits → 1 appel DeepSeek
// Normalise le nom, corrige la marque, catégorise
// Met à jour la base Supabase
//
// Coût estimé: 156K / 50 = 3120 appels × ~2K tokens = ~$2
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const BATCH_SIZE = 50;
const PROGRESS_FILE = '/tmp/jadomi-normalize-progress.json';
const LOG_FILE = '/tmp/jadomi-normalize.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// SUPABASE
// =============================================

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    https.get(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
    }).on('error', reject);
  });
}

function supabasePatch(id, updates) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(updates);
    const req = https.request({
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/scraped_prices?id=eq.${id}`,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(500));
    req.end(payload);
  });
}

// =============================================
// DEEPSEEK
// =============================================

function callDeepSeek(prompt, content) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: content },
      ],
      temperature: 0.1,
      max_tokens: 6000,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          resolve(p.choices?.[0]?.message?.content || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

const NORMALIZE_PROMPT = `Tu es un expert en produits dentaires. Pour chaque produit, retourne:
- cleaned_name: le nom PROPRE du produit (sans HTML, sans prix, sans pourcentage, sans caractères spéciaux parasites, sans le nom du fournisseur). Garde la désignation + le conditionnement.
- brand: la marque CORRECTE (corrige l'orthographe si besoin: "3m" → "3M", "gc" → "GC", "ivoclar" → "Ivoclar Vivadent")
- category: une des catégories suivantes UNIQUEMENT: endodontie, restauration, empreinte, prothese, implantologie, chirurgie, orthodontie, prophylaxie, radiologie, anesthesie, instruments, consommables, equipement, hygiene, labo

Retourne UNIQUEMENT un JSON valide: {"results": [{"index": 1, "cleaned_name": "...", "brand": "...", "category": "..."}]}`;

// =============================================
// MAIN
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const supplierFilter = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;

  // Charger la progression
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}

  const suppliers = supplierFilter
    ? [supplierFilter]
    : ['dentalgooddeal', 'gacd', 'doctorstrong', 'doctorai', 'megadental', 'dentalpromotion', 'dentalclick', 'henryschein', 'b2b-dental'];

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalCost = 0;

  for (const supplier of suppliers) {
    log(`\n========== ${supplier.toUpperCase()} ==========`);
    let offset = progress[supplier] || 0;

    while (true) {
      // Charger un batch
      const products = await supabaseGet(
        `scraped_prices?supplier_name=eq.${supplier}&select=id,product_name,brand,reference,price,category&limit=${BATCH_SIZE}&offset=${offset}&order=id`
      );
      if (!products || !Array.isArray(products) || products.length === 0) break;
      if (limit > 0 && totalProcessed >= limit) break;

      // Construire le contenu pour DeepSeek
      const content = products.map((p, i) =>
        `${i + 1}. "${(p.product_name || '').replace(/\s+/g, ' ').trim().substring(0, 100)}" | marque: ${p.brand || '?'} | ref: ${p.reference || '?'} | prix: ${p.price}€`
      ).join('\n');

      // Appel DeepSeek
      const response = await callDeepSeek(NORMALIZE_PROMPT, content);
      totalCost += 0.0006; // ~2K tokens × $0.27/M

      if (!response) {
        log(`  Batch ${offset}: DeepSeek erreur, skip`);
        offset += BATCH_SIZE;
        continue;
      }

      // Parser la réponse
      let results = [];
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          results = parsed.results || [];
        }
      } catch {
        log(`  Batch ${offset}: parsing erreur`);
        offset += BATCH_SIZE;
        continue;
      }

      // Mettre à jour la base
      let batchUpdated = 0;
      for (const r of results) {
        const idx = (r.index || 1) - 1;
        const product = products[idx];
        if (!product) continue;

        const oldName = (product.product_name || '').replace(/\s+/g, ' ').trim();
        const newName = r.cleaned_name;
        if (!newName || newName.length < 3) continue;

        // Vérifier si ça vaut le coup de mettre à jour
        const needsUpdate = oldName !== newName || (r.brand && r.brand !== product.brand) || (r.category && !product.category);

        if (needsUpdate && !dryRun) {
          const updates = { product_name: newName };
          if (r.brand && r.brand.length > 1) updates.brand = r.brand;
          if (r.category) updates.category = r.category;

          const status = await supabasePatch(product.id, updates);
          if (status < 300) batchUpdated++;
        } else if (needsUpdate) {
          batchUpdated++;
        }
      }

      totalProcessed += products.length;
      totalUpdated += batchUpdated;

      log(`  [${offset}-${offset + products.length}] ${results.length} normalisés, ${batchUpdated} mis à jour${dryRun ? ' (dry-run)' : ''}`);

      // Exemples
      if (offset === (progress[supplier] || 0)) {
        results.slice(0, 3).forEach(r => {
          const orig = products[(r.index || 1) - 1];
          if (orig) log(`    "${(orig.product_name || '').replace(/\s+/g, ' ').substring(0, 40)}" → "${r.cleaned_name}" [${r.brand}] (${r.category})`);
        });
      }

      offset += BATCH_SIZE;
      progress[supplier] = offset;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

      if (products.length < BATCH_SIZE) break;
    }
  }

  log(`\n========== BILAN ==========`);
  log(`Produits traités: ${totalProcessed}`);
  log(`Mis à jour: ${totalUpdated}`);
  log(`Coût DeepSeek estimé: ~$${totalCost.toFixed(2)}`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
