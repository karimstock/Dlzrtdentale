// =============================================================
// JADOMI IA — Estimateur de livraison Rush prothésistes
// =============================================================
// RÈGLES :
//  - Reçoit UNIQUEMENT (ville + code postal) départ et arrivée
//  - Ne voit jamais l'adresse exacte (chiffrée AES-256 ailleurs)
//  - Renvoie un coût de livraison estimé en EUR + délai
//  - Toujours appeler "JADOMI IA" côté UI
// =============================================================

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Distances approximatives (km) entre grandes villes FR — fallback si IA KO
const FALLBACK_DISTANCES_KM = {
  'paris-lyon': 465, 'paris-marseille': 775, 'paris-bordeaux': 585,
  'paris-lille': 225, 'paris-strasbourg': 490, 'paris-nantes': 385,
  'paris-toulouse': 680, 'lyon-marseille': 315, 'lyon-bordeaux': 555,
  'lyon-nantes': 660, 'marseille-bordeaux': 645,
};

function fallbackEstimation(villeA, villeB) {
  const a = (villeA || '').toLowerCase().trim();
  const b = (villeB || '').toLowerCase().trim();
  if (a === b) {
    return { distance_km: 8, cout_eur: 9.90, delai_h: 6, mode: 'coursier_local' };
  }
  const key1 = `${a}-${b}`, key2 = `${b}-${a}`;
  const km = FALLBACK_DISTANCES_KM[key1] || FALLBACK_DISTANCES_KM[key2] || 450;
  // Tarif transporteur express pro : ~0.08€/km + base 12€
  const cout = Math.round((12 + km * 0.08) * 100) / 100;
  return {
    distance_km: km,
    cout_eur: cout,
    delai_h: km < 100 ? 12 : km < 400 ? 24 : 48,
    mode: km < 50 ? 'coursier_local' : 'transporteur_express',
  };
}

/**
 * Estime le coût et le délai d'une livraison Rush entre deux villes FR.
 * @param {string} villeDepart
 * @param {string} cpDepart
 * @param {string} villeArrivee
 * @param {string} cpArrivee
 * @returns {Promise<{distance_km, cout_eur, delai_h, mode, source}>}
 */
async function estimerLivraison(villeDepart, cpDepart, villeArrivee, cpArrivee) {
  // Sécurité : pas d'adresse, pas de nom, juste ville + CP
  if (!villeDepart || !villeArrivee) {
    return { ...fallbackEstimation(villeDepart, villeArrivee), source: 'fallback_no_city' };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...fallbackEstimation(villeDepart, villeArrivee), source: 'fallback_no_api_key' };
  }

  try {
    const prompt = `Tu es JADOMI IA, expert logistique pour prothésistes dentaires.

Estime la livraison express d'un colis dentaire (50g à 2kg, valeur 100-800€) entre :
- DÉPART : ${villeDepart} (${cpDepart || ''})
- ARRIVÉE : ${villeArrivee} (${cpArrivee || ''})

Contexte : transporteur professionnel express (Chronopost, DPD Predict, TNT 12h),
prise en charge avant 17h, livraison le lendemain matin.

Réponds UNIQUEMENT en JSON strict, sans markdown :
{"distance_km": 0, "cout_eur": 0.00, "delai_h": 0, "mode": "coursier_local|transporteur_express|messagerie_24h"}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const txt = response.content?.[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return {
        distance_km: Number(parsed.distance_km) || 0,
        cout_eur: Math.round(Number(parsed.cout_eur) * 100) / 100 || 0,
        delai_h: Number(parsed.delai_h) || 24,
        mode: parsed.mode || 'transporteur_express',
        source: 'jadomi_ia',
      };
    }
    return { ...fallbackEstimation(villeDepart, villeArrivee), source: 'fallback_parse_failed' };
  } catch (err) {
    console.error('[rushIA] estimerLivraison error:', err.message);
    return { ...fallbackEstimation(villeDepart, villeArrivee), source: 'fallback_error' };
  }
}

module.exports = { estimerLivraison };
