// =============================================
// JADOMI RUSH — Calcul transport automatique
// Estimation basee sur code postal + poids
// =============================================

// Poids estime par type d'acte (en grammes)
const POIDS_PAR_TYPE = {
  couronne: 50,
  couronne_zircone: 50,
  couronne_ceramo_metal: 60,
  couronne_emax: 50,
  bridge: 150,
  bridge_3: 150,
  bridge_4: 200,
  pac_complete: 300,
  pac_partielle: 200,
  stellite: 400,
  prothese_amovible: 250,
  inlay_onlay: 30,
  facette: 30,
  pilier_implant: 40,
  transvissee: 50,
  barre_implant: 200,
  gouttiere: 80,
  empreinte: 200,
  reparation: 150,
  default: 150
};

// Zones Colissimo par departement
function getZone(cp) {
  if (!cp) return 'A';
  const dept = cp.slice(0, 2);
  // DOM-TOM
  if (['97', '98'].includes(dept)) return 'OM';
  // Corse
  if (['20'].includes(dept)) return 'B';
  // France metropolitaine
  return 'A';
}

// Distance estimee entre 2 codes postaux (simplifiee)
function estimerDistance(cp1, cp2) {
  if (!cp1 || !cp2) return 400;
  const d1 = parseInt(cp1.slice(0, 2));
  const d2 = parseInt(cp2.slice(0, 2));
  if (d1 === d2) return 30; // meme departement
  const diff = Math.abs(d1 - d2);
  if (diff <= 3) return 100; // departements proches
  if (diff <= 10) return 300;
  if (diff <= 20) return 500;
  return 700;
}

// Tarifs Colissimo estimes (2024-2025)
const TARIFS_COLISSIMO = {
  // poids_max_g: prix_eur
  250: 6.40,
  500: 7.90,
  750: 8.90,
  1000: 9.90,
  2000: 11.90,
  5000: 15.90
};

const TARIFS_CHRONOPOST = {
  250: 12.50,
  500: 14.90,
  750: 16.50,
  1000: 18.90,
  2000: 22.90,
  5000: 29.90
};

function getTarifParPoids(poidsG, tarifs) {
  const seuils = Object.keys(tarifs).map(Number).sort((a, b) => a - b);
  for (const seuil of seuils) {
    if (poidsG <= seuil) return tarifs[seuil];
  }
  return tarifs[seuils[seuils.length - 1]];
}

// Calculer poids total d'une demande
function calculerPoids(typesTravaux) {
  if (!typesTravaux) return POIDS_PAR_TYPE.default;
  if (typeof typesTravaux === 'string') {
    const key = typesTravaux.toLowerCase().replace(/[\s-]+/g, '_');
    return POIDS_PAR_TYPE[key] || POIDS_PAR_TYPE.default;
  }
  // Array de types
  if (Array.isArray(typesTravaux)) {
    return typesTravaux.reduce((total, t) => {
      const key = t.toLowerCase().replace(/[\s-]+/g, '_');
      return total + (POIDS_PAR_TYPE[key] || POIDS_PAR_TYPE.default);
    }, 0);
  }
  return POIDS_PAR_TYPE.default;
}

// Estimation complete transport
function estimerTransport({ cpDepart, cpArrivee, typeTravail, quantite = 1 }) {
  const poidsUnitaire = calculerPoids(typeTravail);
  const poidsTotal = poidsUnitaire * quantite;
  // Ajouter poids emballage (boite protectrice)
  const poidsAvecEmballage = poidsTotal + 150; // 150g emballage
  const distance = estimerDistance(cpDepart, cpArrivee);

  const prixColissimo = getTarifParPoids(poidsAvecEmballage, TARIFS_COLISSIMO);
  const prixChronopost = getTarifParPoids(poidsAvecEmballage, TARIFS_CHRONOPOST);

  const delaiColissimo = distance < 100 ? 1 : distance < 400 ? 2 : 3;
  const delaiChronopost = 1;

  return {
    poids_estime_g: poidsAvecEmballage,
    distance_estimee_km: distance,
    options: [
      {
        transporteur: 'Colissimo',
        service: 'Colissimo suivi 48h',
        prix: prixColissimo,
        delai_jours: delaiColissimo,
        recommande: true
      },
      {
        transporteur: 'Chronopost',
        service: 'Chronopost 24h',
        prix: prixChronopost,
        delai_jours: delaiChronopost,
        recommande: false
      }
    ],
    recommandation: {
      transporteur: 'Colissimo',
      prix: prixColissimo,
      delai_jours: delaiColissimo
    }
  };
}

module.exports = {
  estimerTransport,
  calculerPoids,
  estimerDistance,
  POIDS_PAR_TYPE
};
