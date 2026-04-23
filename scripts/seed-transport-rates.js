#!/usr/bin/env node
// =============================================
// JADOMI — Seed tarifs transport negocies
// Usage: node scripts/seed-transport-rates.js
// =============================================
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const rates = [
  // Chronopost
  { carrier: 'chronopost', distance_km_max: 50,  weight_kg_max: 5,  price_negotiated_eur: 8.50, delivery_hours: 24 },
  { carrier: 'chronopost', distance_km_max: 200, weight_kg_max: 5,  price_negotiated_eur: 10.90, delivery_hours: 24 },
  { carrier: 'chronopost', distance_km_max: 800, weight_kg_max: 5,  price_negotiated_eur: 13.50, delivery_hours: 48 },
  { carrier: 'chronopost', distance_km_max: 50,  weight_kg_max: 15, price_negotiated_eur: 12.00, delivery_hours: 24 },
  { carrier: 'chronopost', distance_km_max: 200, weight_kg_max: 15, price_negotiated_eur: 15.50, delivery_hours: 48 },
  { carrier: 'chronopost', distance_km_max: 800, weight_kg_max: 15, price_negotiated_eur: 18.90, delivery_hours: 48 },
  // TNT
  { carrier: 'tnt', distance_km_max: 50,  weight_kg_max: 5,  price_negotiated_eur: 6.90, delivery_hours: 48 },
  { carrier: 'tnt', distance_km_max: 200, weight_kg_max: 5,  price_negotiated_eur: 8.90, delivery_hours: 48 },
  { carrier: 'tnt', distance_km_max: 800, weight_kg_max: 5,  price_negotiated_eur: 11.50, delivery_hours: 48 },
  { carrier: 'tnt', distance_km_max: 50,  weight_kg_max: 15, price_negotiated_eur: 9.50, delivery_hours: 48 },
  { carrier: 'tnt', distance_km_max: 800, weight_kg_max: 15, price_negotiated_eur: 14.90, delivery_hours: 72 },
  // GLS
  { carrier: 'gls', distance_km_max: 200, weight_kg_max: 10, price_negotiated_eur: 7.50, delivery_hours: 72 },
  { carrier: 'gls', distance_km_max: 800, weight_kg_max: 10, price_negotiated_eur: 9.50, delivery_hours: 72 },
  { carrier: 'gls', distance_km_max: 800, weight_kg_max: 20, price_negotiated_eur: 13.00, delivery_hours: 72 },
  // DPD
  { carrier: 'dpd', distance_km_max: 200, weight_kg_max: 10, price_negotiated_eur: 7.90, delivery_hours: 48 },
  { carrier: 'dpd', distance_km_max: 800, weight_kg_max: 10, price_negotiated_eur: 10.50, delivery_hours: 72 },
  // Colissimo
  { carrier: 'colissimo', distance_km_max: 800, weight_kg_max: 5,  price_negotiated_eur: 6.50, delivery_hours: 72 },
  { carrier: 'colissimo', distance_km_max: 800, weight_kg_max: 15, price_negotiated_eur: 9.90, delivery_hours: 72 },
];

(async () => {
  let inserted = 0;
  for (const r of rates) {
    const { error } = await supabase.from('transport_rates').insert({
      ...r,
      jadomi_margin_pct: 15,
      is_active: true
    });
    if (error) console.warn('Skip:', error.message);
    else inserted++;
  }
  console.log(`${inserted}/${rates.length} tarifs transport inseres`);
  process.exit(0);
})();
