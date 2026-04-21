// =============================================
// JADOMI LABO — Product Matcher (Jaro-Winkler)
// Match produits importes avec catalogue existant
// =============================================

// Jaro-Winkler distance
function jaroWinkler(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase().trim();
  s2 = s2.toLowerCase().trim();
  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (maxDist < 0) return 0;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// Normalise nom produit pour meilleur matching
function normaliserNom(nom) {
  if (!nom) return '';
  return nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match un produit extrait contre le catalogue existant
function matcherProduit(nomExtrait, prixExtrait, catalogueExistant) {
  const nomNorm = normaliserNom(nomExtrait);
  let bestMatch = null;
  let bestScore = 0;

  for (const produit of catalogueExistant) {
    const prodNorm = normaliserNom(produit.nom);
    const score = jaroWinkler(nomNorm, prodNorm);

    // Bonus si prix proche (ecart < 15%)
    let scoreAjuste = score;
    if (prixExtrait && produit.prix_unitaire) {
      const ecartPrix = Math.abs(prixExtrait - produit.prix_unitaire) / produit.prix_unitaire;
      if (ecartPrix < 0.15) scoreAjuste += 0.05;
    }

    if (scoreAjuste > bestScore) {
      bestScore = scoreAjuste;
      bestMatch = produit;
    }
  }

  let action = 'a_valider';
  if (bestScore >= 0.85) action = 'match_valide';
  else if (bestScore < 0.6) action = 'nouveau_produit';

  return {
    produit_existant_id: bestMatch?.id || null,
    score_match: Math.round(bestScore * 1000) / 1000,
    action,
    produit_match: bestMatch
  };
}

// Match batch de produits extraits
function matcherBatch(produitsExtraits, catalogueExistant) {
  const resultats = {
    matches_auto: [],
    a_verifier: [],
    nouveaux: []
  };

  for (const extrait of produitsExtraits) {
    const match = matcherProduit(extrait.nom, extrait.prix_ht, catalogueExistant);
    const ligne = {
      ...extrait,
      produit_existant_id: match.produit_existant_id,
      score_match: match.score_match,
      action: match.action,
      produit_match_nom: match.produit_match?.nom || null
    };

    if (match.action === 'match_valide') resultats.matches_auto.push(ligne);
    else if (match.action === 'a_valider') resultats.a_verifier.push(ligne);
    else resultats.nouveaux.push(ligne);
  }

  return resultats;
}

module.exports = { jaroWinkler, normaliserNom, matcherProduit, matcherBatch };
