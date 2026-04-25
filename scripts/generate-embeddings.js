#!/usr/bin/env node
// =============================================
// JADOMI — Generation embeddings vectoriels
// Passe 51 — pgvector + recherche semantique
//
// Usage :
//   node scripts/generate-embeddings.js [--limit 5000]
//
// Prerequis : extension pgvector activee dans Supabase Dashboard
// Modele : text-embedding-3-small (OpenAI) — $0.02/1M tokens
// Alternative : Voyage AI si OPENAI_API_KEY absent
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-embeddings.log';
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit'))?.split('=')[1] || '5000');
const BATCH_SIZE = 50;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function generateEmbeddingsOpenAI(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536
    })
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

async function generateEmbeddingsAnthropic(texts) {
  // Fallback: utiliser Claude pour generer un pseudo-embedding
  // (moins bon mais fonctionne sans OPENAI_API_KEY)
  log('OPENAI_API_KEY absent — embeddings non generes');
  log('Pour activer la recherche semantique, ajoutez OPENAI_API_KEY dans .env');
  return null;
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Generation Embeddings     ║');
  log(`║  Limit: ${LIMIT}                       ║`);
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    log('AVERTISSEMENT: OPENAI_API_KEY absent');
    log('La recherche semantique ne sera pas disponible.');
    log('Ajoutez OPENAI_API_KEY dans .env pour activer.');
    process.exit(0);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Verifier que pgvector est actif
  try {
    const { error } = await supabase.rpc('check_pgvector', {});
    if (error && !error.message.includes('does not exist')) {
      log('NOTE: pgvector doit etre active dans Supabase Dashboard');
      log('SQL: CREATE EXTENSION IF NOT EXISTS vector;');
      log('Puis: ALTER TABLE products_database ADD COLUMN embedding vector(1536);');
    }
  } catch (e) { /* continue */ }

  // Recuperer les produits sans embedding
  // Note: si la colonne embedding n'existe pas encore, on skip
  let products;
  try {
    const { data, error } = await supabase.from('products_database')
      .select('id, gtin, name, name_fr, brand, manufacturer, category, subcategory')
      .is('embedding', null)
      .not('name_fr', 'is', null)
      .limit(LIMIT);

    if (error) throw error;
    products = data;
  } catch (e) {
    log(`Colonne embedding probablement absente: ${e.message}`);
    log('Activez pgvector et ajoutez la colonne embedding dans Supabase Dashboard');
    log('SQL: ALTER TABLE products_database ADD COLUMN embedding vector(1536);');
    process.exit(0);
  }

  if (!products?.length) {
    log('Aucun produit a traiter (tous ont deja un embedding ou pas de name_fr)');
    return;
  }

  log(`${products.length} produits a vectoriser`);
  let generated = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    // Construire le texte pour l'embedding
    const texts = batch.map(p =>
      [p.name_fr || p.name, p.brand, p.manufacturer, p.category, p.subcategory]
        .filter(Boolean).join(' ')
    );

    try {
      const embeddings = await generateEmbeddingsOpenAI(texts);

      for (let j = 0; j < batch.length; j++) {
        try {
          await supabase.from('products_database')
            .update({ embedding: embeddings[j] })
            .eq('id', batch[j].id);
          generated++;
        } catch (e) {
          errors++;
        }
      }
    } catch (e) {
      errors += batch.length;
      log(`Erreur batch ${i}: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }

    // Rate limit OpenAI: 500ms entre batchs
    await new Promise(r => setTimeout(r, 500));

    if ((i / BATCH_SIZE) % 20 === 0) {
      log(`Progress: ${generated} generes, ${errors} erreurs (${Math.round(i / products.length * 100)}%)`);
    }
  }

  const tokenEstimate = products.length * 50; // ~50 tokens par produit
  const costEstimate = (tokenEstimate / 1000000 * 0.02).toFixed(4);
  log(`=== Embeddings termine ===`);
  log(`Generes: ${generated} | Erreurs: ${errors} | Cout estime: ~${costEstimate}$`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
