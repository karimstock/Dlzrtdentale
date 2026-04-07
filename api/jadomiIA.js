// =============================================================
// JADOMI IA — Service IA centralisé pour la plateforme dentiste/prothésiste
// =============================================================
//  - Toujours appelé "JADOMI IA" côté UI (jamais Claude)
//  - Reçoit ville + CP uniquement (jamais d'adresse exacte)
//  - 3 fonctions : calculerLivraison, calculerTarifTravail, verifierUpgrade
// =============================================================

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ----- Helpers -----
function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// Fallback distance approximative (km) entre grandes villes FR
const FALLBACK_DISTANCES_KM = {
  'paris-lyon': 465, 'paris-marseille': 775, 'paris-bordeaux': 585,
  'paris-lille': 225, 'paris-strasbourg': 490, 'paris-nantes': 385,
  'paris-toulouse': 680, 'lyon-marseille': 315, 'lyon-bordeaux': 555,
  'lyon-nantes': 660, 'marseille-bordeaux': 645,
};
function fallbackLivraison(villeA, villeB) {
  const a = (villeA || '').toLowerCase().trim();
  const b = (villeB || '').toLowerCase().trim();
  if (!a || !b || a === b) {
    return { transporteur: 'Stuart', tarif: 9.90, delai: 'J+0', raison: 'Coursier local <30km' };
  }
  const km = FALLBACK_DISTANCES_KM[`${a}-${b}`] || FALLBACK_DISTANCES_KM[`${b}-${a}`] || 450;
  const tarif = Math.round((12 + km * 0.08) * 100) / 100;
  return {
    transporteur: km < 50 ? 'Stuart' : 'Chronopost',
    tarif,
    delai: km < 100 ? 'J+1' : 'J+2',
    raison: km < 50 ? 'Coursier local' : 'Express national colis médical fragile',
  };
}

// =============================================================
// 1. CALCUL TARIF LIVRAISON
// =============================================================
async function calculerLivraison(villeDepart, cpDepart, villeArrivee, cpArrivee) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackLivraison(villeDepart, villeArrivee);
  }
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Tu es JADOMI IA, expert logistique France. Colis médical fragile (prothèse dentaire, <500g, valeur 100-800€).
Trajet : ${villeDepart || '?'} (${cpDepart || ''}) → ${villeArrivee || '?'} (${cpArrivee || ''}).
Compare Chronopost, Colissimo Express, Stuart (si même ville ou <30km).
Réponds UNIQUEMENT en JSON sans markdown :
{"transporteur":"nom","tarif":nombre,"delai":"J+1","raison":"explication courte"}`
      }]
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(text);
    if (parsed && parsed.transporteur) return parsed;
    return fallbackLivraison(villeDepart, villeArrivee);
  } catch (err) {
    console.error('[jadomiIA.calculerLivraison]', err.message);
    return fallbackLivraison(villeDepart, villeArrivee);
  }
}

// =============================================================
// 2. CALCUL TARIF TRAVAIL TOUT INCLUS
// =============================================================
//  travaux = [{ nom, tarif_min, tarif_max, tarif_reference, quantite }]
//  niveauProthesiste : standard | confirme | expert
//  Commission JADOMI = 10% sur tarif travaux uniquement (pas sur livraison)
async function calculerTarifTravail(travaux, niveauProthesiste, villeDepart, cpDepart, villeArrivee, cpArrivee) {
  // Calcul local déterministe (toujours fait, sert de base + fallback)
  let tarifTravaux = 0;
  let delaiMax = 0;
  const liste = Array.isArray(travaux) ? travaux : [];
  for (const t of liste) {
    const qty = parseInt(t.quantite) || 1;
    let prix = parseFloat(t.tarif_reference) || 0;
    if (niveauProthesiste === 'standard') prix = parseFloat(t.tarif_min) || prix;
    else if (niveauProthesiste === 'expert') prix = parseFloat(t.tarif_max) || prix;
    tarifTravaux += prix * qty;
    const d = niveauProthesiste === 'expert'
      ? (parseInt(t.delai_jours_expert) || 3)
      : (parseInt(t.delai_jours_standard) || 5);
    if (d > delaiMax) delaiMax = d;
  }
  tarifTravaux = Math.round(tarifTravaux * 100) / 100;

  // Livraison via IA (ou fallback)
  const livraison = await calculerLivraison(villeDepart, cpDepart, villeArrivee, cpArrivee);
  const tarifLivraison = parseFloat(livraison.tarif) || 0;

  const commission = Math.round(tarifTravaux * 0.10 * 100) / 100;
  const tarifNetProth = Math.round((tarifTravaux - commission) * 100) / 100;
  const tarifTotal = Math.round((tarifTravaux + tarifLivraison) * 100) / 100;

  return {
    tarif_travaux: tarifTravaux,
    tarif_livraison: tarifLivraison,
    transporteur: livraison.transporteur,
    commission_jadomi: commission,
    tarif_net_prothesiste: tarifNetProth,
    tarif_total_dentiste: tarifTotal,
    delai_jours: delaiMax,
    detail: `${liste.length} travail(aux) — niveau ${niveauProthesiste} — livraison ${livraison.transporteur} ${livraison.delai} (${livraison.raison || ''})`,
  };
}

// =============================================================
// 3. VÉRIFICATION UPGRADE PROTHÉSISTE
// =============================================================
//  Standard → Confirmé : note ≥ 4.0 et ≥ 10 travaux
//  Confirmé → Expert   : note ≥ 4.5 et ≥ 30 travaux
async function verifierUpgrade(jadomiId, notesMoyenne, nombreTravaux, niveauActuel) {
  let nouveauNiveau = niveauActuel;
  let message = null;

  const note = parseFloat(notesMoyenne) || 0;
  const nb = parseInt(nombreTravaux) || 0;

  if (niveauActuel === 'standard' && note >= 4.0 && nb >= 10) {
    nouveauNiveau = 'confirme';
    message = `Félicitations ! Grâce à votre excellente note de ${note.toFixed(1)}/5 sur ${nb} travaux, JADOMI vous élève au niveau Confirmé. Vous serez désormais mieux rémunéré sur chaque commande.`;
  } else if (niveauActuel === 'confirme' && note >= 4.5 && nb >= 30) {
    nouveauNiveau = 'expert';
    message = `Félicitations ! Votre expertise est reconnue par JADOMI. Avec ${note.toFixed(1)}/5 de moyenne sur ${nb} travaux, vous accédez au statut Expert. Les dentistes vous verront en priorité et votre rémunération augmente.`;
  }

  return {
    jadomi_id: jadomiId,
    nouveauNiveau,
    ancienNiveau: niveauActuel,
    message,
    upgrade: nouveauNiveau !== niveauActuel,
  };
}

module.exports = { calculerLivraison, calculerTarifTravail, verifierUpgrade };
