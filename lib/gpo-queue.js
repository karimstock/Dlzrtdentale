// =============================================
// JADOMI — GPO Smart Queue : Weighted Round-Robin
// =============================================
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

/**
 * Selectionne le prochain fournisseur a solliciter pour une demande GPO.
 * Logique :
 * 1. Filtrer fournisseurs compatibles (specialites matches items, status=active)
 * 2. Weighted Round-Robin : chaque fournisseur a N slots, melange pondere
 * 3. Bonus proximite geographique si prefer_local=true
 * 4. Exclure fournisseurs deja sollicites sur cette request
 */
async function pickNextSupplier({ requestId, itemsCategories, preferLocal,
  societeLat, societeLng, alreadyAttempted = [] }) {

  let query = admin()
    .from('suppliers')
    .select('*')
    .eq('status', 'active');

  if (alreadyAttempted.length > 0) {
    query = query.not('id', 'in', `(${alreadyAttempted.join(',')})`);
  }

  const { data: suppliers, error } = await query;
  if (error) throw error;
  if (!suppliers || suppliers.length === 0) return null;

  // Filtrer par specialites
  const eligible = suppliers.filter(s => {
    if (!s.specialties || s.specialties.length === 0) return true;
    return s.specialties.some(spec => itemsCategories.includes(spec));
  });

  if (eligible.length === 0) return null;

  // Construire file ponderee (chaque fournisseur apparait slots_count fois)
  let weightedQueue = [];
  eligible.forEach(s => {
    for (let i = 0; i < (s.slots_count || 1); i++) {
      weightedQueue.push(s);
    }
  });

  // Proximite geographique si demandee
  if (preferLocal && societeLat && societeLng) {
    weightedQueue = weightedQueue.map(s => ({
      supplier: s,
      distanceKm: s.lat && s.lng
        ? haversine(societeLat, societeLng, s.lat, s.lng)
        : 9999,
      proximityScore: s.lat && s.lng
        ? Math.max(0, 100 - haversine(societeLat, societeLng, s.lat, s.lng))
        : 0
    }));
    weightedQueue.sort((a, b) =>
      (b.proximityScore + Math.random() * 20) -
      (a.proximityScore + Math.random() * 20)
    );
    weightedQueue = weightedQueue.map(item => item.supplier);
  } else {
    weightedQueue = shuffleArray(weightedQueue);
  }

  return weightedQueue[0];
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Calcule le delai de reponse selon l'heure
 * 9h-19h en semaine : 15 min — sinon : 60 min
 */
function computeDeadline(createdAt = new Date()) {
  const date = new Date(createdAt);
  const day = date.getDay(); // 0=dim, 6=sam
  const hour = date.getHours();
  const isBusinessHours = day >= 1 && day <= 5 && hour >= 9 && hour < 19;
  const delayMinutes = isBusinessHours ? 15 : 60;

  return {
    isBusinessHours,
    deadline: new Date(date.getTime() + delayMinutes * 60000),
    delayMinutes
  };
}

module.exports = { pickNextSupplier, computeDeadline, haversine, admin };
