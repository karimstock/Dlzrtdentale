// =============================================
// JADOMI LABO — Calculateur TVA
// Legislation : art. 261, 4, 1 CGI + BOFiP
// =============================================

const TAUX_TVA_STANDARD = 20;

// Calcule les montants pour une ligne de BL
function calculerLigne({ prix_unitaire, quantite = 1, remise_pct = 0, tva_applicable = false, taux_tva = 0 }) {
  const pu = Number(prix_unitaire) || 0;
  const qty = Number(quantite) || 1;
  const remise = Number(remise_pct) || 0;
  const taux = tva_applicable ? (Number(taux_tva) || TAUX_TVA_STANDARD) : 0;

  const prix_apres_remise = pu * (1 - remise / 100);
  const montant_ht = Math.round(prix_apres_remise * qty * 100) / 100;
  const montant_tva = tva_applicable ? Math.round(montant_ht * taux / 100 * 100) / 100 : 0;
  const montant_ttc = Math.round((montant_ht + montant_tva) * 100) / 100;

  return {
    prix_unitaire_apres_remise: Math.round(prix_apres_remise * 100) / 100,
    montant_ht,
    montant_tva,
    montant_ttc,
    taux_tva: taux
  };
}

// Calcule les totaux pour un ensemble de lignes
function calculerTotaux(lignes, remise_globale_pct = 0) {
  let total_ht_exonere = 0;
  let total_ht_taxable = 0;
  let total_tva = 0;

  for (const l of lignes) {
    if (l.tva_applicable) {
      total_ht_taxable += l.montant_ht;
      total_tva += l.montant_tva;
    } else {
      total_ht_exonere += l.montant_ht;
    }
  }

  // Remise globale
  const rg = Number(remise_globale_pct) || 0;
  if (rg > 0) {
    const coef = 1 - rg / 100;
    total_ht_exonere = Math.round(total_ht_exonere * coef * 100) / 100;
    total_ht_taxable = Math.round(total_ht_taxable * coef * 100) / 100;
    total_tva = Math.round(total_tva * coef * 100) / 100;
  }

  total_ht_exonere = Math.round(total_ht_exonere * 100) / 100;
  total_ht_taxable = Math.round(total_ht_taxable * 100) / 100;
  total_tva = Math.round(total_tva * 100) / 100;
  const total_ttc = Math.round((total_ht_exonere + total_ht_taxable + total_tva) * 100) / 100;

  return { total_ht_exonere, total_ht_taxable, total_tva, total_ttc };
}

// Mentions legales selon regime TVA
function mentionsLegales(regime_tva, has_exonere, has_taxable) {
  const mentions = [];

  if (regime_tva === 'franchise_base') {
    mentions.push('TVA non applicable - art. 293 B du CGI');
  } else {
    if (has_exonere) {
      mentions.push('Exoneration TVA art. 261, 4, 1° du CGI (protheses dentaires)');
    }
    if (has_taxable) {
      mentions.push('TVA 20% applicable (ortheses dentaires)');
    }
  }

  mentions.push('En cas de retard de paiement, une penalite de 3 fois le taux d\'interet legal sera appliquee (art. L441-6 Code de Commerce).');
  mentions.push('Indemnite forfaitaire pour frais de recouvrement : 40 EUR (art. D441-5).');

  return mentions;
}

module.exports = { calculerLigne, calculerTotaux, mentionsLegales, TAUX_TVA_STANDARD };
