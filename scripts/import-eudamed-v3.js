#!/usr/bin/env node
// =============================================
// JADOMI — EUDAMED v3 — Fabricants manquants
// Cible les fabricants qui ont des résultats EUDAMED
// mais n'étaient pas couverts par les scripts précédents
// Anti-doublons : upsert on gtin + ignoreDuplicates
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-v3.log';
const SEARCH_API = 'https://search.eudamed.com/api/search';

// Fabricants avec résultats confirmés + matching vérifié
const SEARCHES = [
  // ═══ COMPOSITES & MATERIAUX ═══
  { q: 'VOCO GmbH', m: 'VOCO', c: 'Composites' },
  { q: 'Kuraray Noritake', m: 'Kuraray', c: 'Composites' },
  { q: 'Tokuyama Dental', m: 'Tokuyama', c: 'Composites' },
  { q: 'SDI Limited', m: 'SDI', c: 'Composites' },

  // ═══ ENDODONTIE / INSTRUMENTS ═══
  { q: 'Coltene Whaledent', m: 'Coltene', c: 'Endodontie' },
  { q: 'Coltene', m: 'Coltene', c: 'Endodontie' },

  // ═══ EMPREINTES ═══
  { q: 'Kettenbach GmbH', m: 'Kettenbach', c: 'Empreintes' },

  // ═══ INSTRUMENTS ═══
  { q: 'Bien-Air', m: 'Bien-Air', c: 'Instruments' },
  { q: 'NSK Nakanishi', m: 'Nakanishi', c: 'Instruments' },
  { q: 'Hager Werken', m: 'Hager', c: 'Instruments' },
  { q: 'Hager & Werken', m: 'Hager', c: 'Instruments' },

  // ═══ IMPLANTS / PROTHESE ═══
  { q: 'Dentsply', m: 'Dentsply', c: 'Implants' },
  { q: 'Dentsply Sirona', m: 'Dentsply', c: 'Implants' },

  // ═══ EQUIPEMENT ═══
  { q: 'Stern Weber', m: 'Stern Weber', c: 'Equipement' },
  { q: 'Dürr Dental', m: 'Dürr', c: 'Equipement' },
  { q: 'Castellini', m: 'Castellini', c: 'Equipement' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchAndImport(supabase, search) {
  let skip = 0, found = 0, inserted = 0;

  while (true) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `${SEARCH_API}?q=${encodeURIComponent(search.q)}&type=device&size=100&skip=${skip}`,
        { headers: { 'Accept': 'application/json' }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) { log(`  HTTP ${res.status} — skip`); break; }
      const data = await res.json();
      if (!data.results?.length) break;

      // Filtrer par fabricant
      const matched = data.results.filter(r =>
        (r.manufacturer_name || '').toLowerCase().includes(search.m.toLowerCase())
      );

      const products = matched
        .map(r => {
          const gtin = r.primary_di_code;
          if (!gtin || gtin.length > 14) return null;
          return {
            gtin,
            name: r.device_name_text || r.trade_name_text || r.reference || 'Unknown',
            name_fr: r.device_name_text || r.trade_name_text || null,
            brand: (r.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
            manufacturer: r.manufacturer_name,
            category: search.c,
            reference: r.reference || null,
            market_region: 'EU',
            source: 'eudamed',
            source_metadata: {
              eudamed_uuid: r.eudamed_uuid,
              manufacturer_srn: r.manufacturer_srn
            },
            confidence_score: 0.8,
            last_synced_at: new Date().toISOString()
          };
        })
        .filter(Boolean);

      if (products.length > 0) {
        // Upsert en batch — les doublons GTIN sont ignorés
        try {
          const { error } = await supabase
            .from('products_database')
            .upsert(products, { onConflict: 'gtin', ignoreDuplicates: true });
          if (error) {
            // Fallback un par un
            for (const p of products) {
              try {
                await supabase.from('products_database')
                  .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
                inserted++;
              } catch (e2) { /* doublon ou erreur, on continue */ }
            }
          } else {
            inserted += products.length;
          }
        } catch (e) {
          for (const p of products) {
            try {
              await supabase.from('products_database')
                .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
              inserted++;
            } catch (e2) {}
          }
        }
        found += products.length;
      }

      // Pagination
      if (data.results.length < 100) break;
      if (skip + 100 > (data.total || 99999)) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      log(`  Erreur: ${e.message}`);
      break;
    }
  }
  return { found, inserted };
}

async function main() {
  // Effacer l'ancien log
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  log('╔══════════════════════════════════════════════════╗');
  log('║  JADOMI — EUDAMED v3 — Fabricants manquants     ║');
  log(`║  ${SEARCHES.length} recherches — avec pagination complète   ║`);
  log('║  Anti-doublons : upsert gtin + ignoreDuplicates ║');
  log('╚══════════════════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Compter avant
  const { count: before } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'eudamed');
  log(`Produits EUDAMED avant : ${before}`);

  let grandTotal = 0, grandInserted = 0;

  for (let i = 0; i < SEARCHES.length; i++) {
    const s = SEARCHES[i];
    log(`\n[${i + 1}/${SEARCHES.length}] ${s.q} (${s.c})`);
    const { found, inserted } = await searchAndImport(supabase, s);
    grandTotal += found;
    grandInserted += inserted;
    if (found > 0) {
      log(`  → ${found} trouvés, ${inserted} insérés/upsertés`);
    } else {
      log(`  → 0 résultat`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  // Compter après
  const { count: after } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'eudamed');

  log(`\n${'═'.repeat(50)}`);
  log(`EUDAMED v3 TERMINÉ`);
  log(`  Total trouvés : ${grandTotal}`);
  log(`  Total insérés/upsertés : ${grandInserted}`);
  log(`  Produits EUDAMED avant : ${before}`);
  log(`  Produits EUDAMED après : ${after}`);
  log(`  Nouveaux uniques : ${after - before}`);
  log('═'.repeat(50));
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
