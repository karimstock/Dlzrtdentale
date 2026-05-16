#!/usr/bin/env node
// =============================================
// JADOMI — Nettoyage noms DentalGoodDeal
//
// Les 4118 produits DGD ont des product_name pollues
// par du HTML/prix/marque parasites issus du scraping.
//
// Usage : node scripts/fix-dgd-names.js
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BATCH_SIZE = 100;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  process.exit(1);
}

// =============================================
// SUPABASE HELPERS (REST API)
// =============================================

function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'GET' ? 'count=exact' : 'return=minimal',
      },
    };

    const req = https.request(url.toString(), options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          const count = res.headers['content-range']?.split('/')[1];
          resolve({ data: data ? JSON.parse(data) : null, count: count ? parseInt(count) : null });
        } catch (e) {
          resolve({ data: null, count: null });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// =============================================
// NETTOYAGE DU NOM
// =============================================

function cleanProductName(name, brand) {
  if (!name) return name;

  let cleaned = name;

  // 1. Couper au premier \n — tout ce qui suit est du bruit (prix, marque, remise)
  const nlIdx = cleaned.indexOf('\n');
  if (nlIdx > 0) {
    cleaned = cleaned.substring(0, nlIdx);
  }

  // 2. Retirer \n, \t, \r restants
  cleaned = cleaned.replace(/[\n\t\r]/g, ' ');

  // 3. Retirer les prix parasites : "- 2,55 €", "3,20 €", "-20%"
  cleaned = cleaned.replace(/\s*-\s*\d+[.,]\d{2}\s*€/g, '');
  cleaned = cleaned.replace(/\s*\d+[.,]\d{2}\s*€/g, '');
  cleaned = cleaned.replace(/\s*-\d+\s*%/g, '');

  // 4. Retirer le nom de marque en doublon (si deja dans la colonne brand)
  if (brand && brand.length > 1) {
    // Retirer " - Brand" ou " Brand" en fin de chaine
    const brandPattern = new RegExp('\\s*-?\\s*' + escapeRegex(brand) + '\\s*$', 'i');
    cleaned = cleaned.replace(brandPattern, '');
    // Retirer "Brand - " en debut de chaine
    const brandStartPattern = new RegExp('^\\s*' + escapeRegex(brand) + '\\s*-\\s*', 'i');
    cleaned = cleaned.replace(brandStartPattern, '');
  }

  // 5. Espaces multiples → un seul
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // 6. Trim
  cleaned = cleaned.trim();

  return cleaned;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================
// MAIN
// =============================================

async function run() {
  console.log('=== JADOMI — Nettoyage noms DentalGoodDeal ===\n');

  // 1. Charger tous les produits DGD par batch
  const allProducts = [];
  let offset = 0;

  while (true) {
    const path = `scraped_prices?supplier_name=eq.dentalgooddeal&select=id,product_name,brand&order=id&limit=${BATCH_SIZE}&offset=${offset}`;
    const { data } = await supabaseRequest('GET', path);

    if (!data || data.length === 0) break;
    allProducts.push(...data);
    offset += data.length;
    process.stdout.write(`\r  Chargement... ${allProducts.length} produits`);

    if (data.length < BATCH_SIZE) break;
  }

  console.log(`\n  Total charge: ${allProducts.length} produits DGD\n`);

  if (allProducts.length === 0) {
    console.log('Aucun produit DGD trouve.');
    return;
  }

  // 2. Nettoyer et detecter les doublons post-nettoyage
  //    Contrainte unique (supplier_name, product_name) : si plusieurs produits
  //    se retrouvent avec le meme nom apres nettoyage, on garde le premier
  //    et on supprime les autres.

  // Map: cleanedName → [ {id, oldName, newName} ]
  const byCleanedName = new Map();
  let alreadyClean = 0;

  for (const p of allProducts) {
    const cleaned = cleanProductName(p.product_name, p.brand);
    if (cleaned === p.product_name) {
      // Deja propre — on l'enregistre quand meme pour detecter les collisions
      alreadyClean++;
    }
    const key = cleaned.toLowerCase();
    if (!byCleanedName.has(key)) {
      byCleanedName.set(key, []);
    }
    byCleanedName.get(key).push({
      id: p.id,
      oldName: p.product_name,
      newName: cleaned,
      needsUpdate: cleaned !== p.product_name,
    });
  }

  // Separer : corrections uniques vs doublons a deduper
  const corrections = [];   // PATCH product_name
  const toDelete = [];       // DELETE (doublons)

  for (const [, group] of byCleanedName) {
    // Le premier du groupe est le keeper
    const keeper = group[0];
    if (keeper.needsUpdate) {
      corrections.push(keeper);
    }
    // Les suivants sont des doublons → supprimer
    for (let i = 1; i < group.length; i++) {
      toDelete.push(group[i]);
    }
  }

  console.log(`  Deja propres:              ${alreadyClean}`);
  console.log(`  Corrections a appliquer:   ${corrections.length}`);
  console.log(`  Doublons a supprimer:      ${toDelete.length}`);
  console.log(`  Noms uniques finaux:       ${byCleanedName.size}\n`);

  // Afficher quelques exemples
  const examples = corrections.filter(c => c.oldName.includes('\n') || c.oldName.includes('\t')).slice(0, 5);
  for (const ex of examples) {
    const oldShort = ex.oldName.replace(/\n/g, '\\n').replace(/\t/g, '\\t').substring(0, 80);
    console.log(`  AVANT: "${oldShort}"`);
    console.log(`  APRES: "${ex.newName}"\n`);
  }

  if (toDelete.length > 0) {
    console.log(`  Exemples doublons:`);
    for (const d of toDelete.slice(0, 3)) {
      const oldShort = d.oldName.replace(/\n/g, '\\n').replace(/\t/g, '\\t').substring(0, 60);
      console.log(`    SUPPR: "${oldShort}" → "${d.newName}"`);
    }
    console.log('');
  }

  // 3. Supprimer les doublons d'abord (pour eviter les conflits de contrainte unique)
  let deleted = 0;
  let deleteErrors = 0;

  if (toDelete.length > 0) {
    console.log('  Phase 1: Suppression des doublons...');
    for (let i = 0; i < toDelete.length; i++) {
      try {
        const path = `scraped_prices?id=eq.${toDelete[i].id}`;
        await supabaseRequest('DELETE', path);
        deleted++;
      } catch (e) {
        deleteErrors++;
        if (deleteErrors <= 3) console.error(`  Erreur DELETE id=${toDelete[i].id}: ${e.message}`);
      }
      if ((i + 1) % 100 === 0 || i === toDelete.length - 1) {
        process.stdout.write(`\r    Supprimes: ${deleted} / ${toDelete.length} (erreurs: ${deleteErrors})`);
      }
    }
    console.log('');
  }

  // 4. Appliquer les corrections de noms
  let updated = 0;
  let errors = 0;

  if (corrections.length > 0) {
    console.log('  Phase 2: Mise a jour des noms...');
    for (let i = 0; i < corrections.length; i++) {
      const c = corrections[i];
      try {
        const path = `scraped_prices?id=eq.${c.id}`;
        await supabaseRequest('PATCH', path, { product_name: c.newName });
        updated++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error(`  Erreur PATCH id=${c.id}: ${e.message}`);
      }
      if ((i + 1) % 100 === 0 || i === corrections.length - 1) {
        process.stdout.write(`\r    Mis a jour: ${updated} / ${corrections.length} (erreurs: ${errors})`);
      }
    }
    console.log('');
  }

  console.log(`\n=== TERMINE ===`);
  console.log(`  Produits charges:    ${allProducts.length}`);
  console.log(`  Doublons supprimes:  ${deleted} (erreurs: ${deleteErrors})`);
  console.log(`  Noms corriges:       ${updated} (erreurs: ${errors})`);
  console.log(`  Deja propres:        ${alreadyClean}`);
  console.log(`  Produits restants:   ${allProducts.length - deleted}`);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
