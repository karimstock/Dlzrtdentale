#!/usr/bin/env node
// =============================================
// JADOMI — Enrichissement IA produits (Claude Sonnet)
// Passe 51 — Categorisation FR + description + mots-cles
//
// Usage :
//   node scripts/enrich-products-ia.js [--batch 10] [--limit 1000]
//
// Cout estime : ~50-100$ pour 100K produits (batch 10)
// =============================================

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-enrich.log';
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch'))?.split('=')[1] || '10');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit'))?.split('=')[1] || '1000');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Enrichissement IA         ║');
  log(`║  Batch: ${BATCH_SIZE} | Limit: ${LIMIT}         ║`);
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ANTHROPIC_API_KEY) {
    log('ERREUR: SUPABASE_URL, SUPABASE_SERVICE_KEY et ANTHROPIC_API_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Recuperer les produits non enrichis
  const { data: products, error } = await supabase.from('products_database')
    .select('id, gtin, name, name_en, brand, manufacturer, category, gmdn_code')
    .is('name_fr', null)
    .order('scan_count', { ascending: false })
    .limit(LIMIT);

  if (error || !products?.length) {
    log(error ? `Erreur: ${error.message}` : 'Aucun produit a enrichir');
    return;
  }

  log(`${products.length} produits a enrichir`);
  let enriched = 0;
  let errors = 0;
  let tokensUsed = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const productsList = batch.map((p, idx) =>
      `${idx + 1}. GTIN:${p.gtin} | Name:${p.name} | Brand:${p.brand || 'N/A'} | Manufacturer:${p.manufacturer || 'N/A'} | GMDN:${p.gmdn_code || 'N/A'}`
    ).join('\n');

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `Tu es un expert en produits dentaires et medicaux. Tu categorises et traduis des produits en francais pour un logiciel de gestion de cabinet dentaire / laboratoire de prothese.

Categories principales : Instruments, Consommables, Implants, Prothese, Orthodontie, Endodontie, Parodontie, Radiologie, Hygiene, Anesthesie, Chirurgie, Empreintes, Composites, Ceramiques, CFAO, Equipement, Divers.

Reponds UNIQUEMENT avec un JSON array.`,
        messages: [{
          role: 'user',
          content: `Enrichis ces ${batch.length} produits dentaires/medicaux en francais.

${productsList}

Pour chaque produit, retourne :
{
  "idx": 1,
  "name_fr": "Nom en francais",
  "category": "Categorie principale",
  "subcategory": "Sous-categorie",
  "keywords": ["mot1", "mot2", ...],
  "usage": "Description courte usage en cabinet"
}

JSON array strict, pas de markdown :`
        }]
      });

      tokensUsed += (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
      const txt = msg.content[0]?.text || '';
      const match = txt.match(/\[[\s\S]*\]/);
      if (match) {
        const results = JSON.parse(match[0]);
        for (const result of results) {
          const product = batch[result.idx - 1];
          if (!product) continue;

          await supabase.from('products_database').update({
            name_fr: result.name_fr,
            category: result.category,
            subcategory: result.subcategory,
            metadata: {
              ...(product.metadata || {}),
              keywords_fr: result.keywords,
              usage_fr: result.usage,
              enriched_at: new Date().toISOString(),
              enriched_by: 'claude_haiku'
            }
          }).eq('id', product.id);

          enriched++;
        }
      }
    } catch (e) {
      errors += batch.length;
      log(`Erreur batch ${i}: ${e.message}`);
      // Rate limit : attendre 5s si erreur
      await new Promise(r => setTimeout(r, 5000));
    }

    // Rate limit : 1s entre les batchs
    await new Promise(r => setTimeout(r, 1000));

    if ((i / BATCH_SIZE) % 10 === 0) {
      log(`Progress: ${enriched} enrichis, ${errors} erreurs, ${tokensUsed} tokens (${Math.round(i / products.length * 100)}%)`);
    }
  }

  const costEstimate = (tokensUsed / 1000000 * 0.25).toFixed(2);
  log(`=== Enrichissement IA termine ===`);
  log(`Enrichis: ${enriched} | Erreurs: ${errors} | Tokens: ${tokensUsed} (~${costEstimate}$)`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
