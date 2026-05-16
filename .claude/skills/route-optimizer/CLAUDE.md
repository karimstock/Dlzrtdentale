---
name: route-optimizer
description: Optimisation tournées IDE + livraisons prothésiste — TSP, Google Maps, temps réel, zones
---

# Route Optimizer — Tournées JADOMI

## Cas d'usage JADOMI
1. **Tournées IDE** : infirmière libérale, 10-20 patients/jour, domicile, priorités médicales
2. **Livraisons prothésiste** : coursier labo, 5-15 cabinets/jour, fenêtres horaires
3. **Zone planning** : découpage secteurs optimal pour équipes

## Google Maps APIs utilisées
- **Directions API** : itinéraire A→B avec waypoints
- **Distance Matrix API** : matrice NxN distances/temps
- **Route Optimization API** : résolution TSP multi-contraintes
- **Geocoding API** : adresse → lat/lng

## Calcul matrice de distances
```js
const axios = require('axios');
const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function matriceDistances(origines, destinations) {
  const res = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
    params: {
      origins: origines.map(o => `${o.lat},${o.lng}`).join('|'),
      destinations: destinations.map(d => `${d.lat},${d.lng}`).join('|'),
      mode: 'driving',
      departure_time: 'now', // trafic temps réel
      language: 'fr',
      key: GMAPS_KEY
    }
  });
  return res.data.rows; // [{ elements: [{ distance, duration, duration_in_traffic }] }]
}
```

## Optimisation tournée IDE (TSP avec priorités)
```js
async function optimiserTourneeIDE(patients, depart, heureDebut) {
  // 1. Classer par priorité
  const critiques = patients.filter(p => p.priorite === 'critique');
  const normaux = patients.filter(p => p.priorite === 'normal');
  const suivis = patients.filter(p => p.priorite === 'suivi');

  // 2. Critiques en premier (fenêtre 8h-10h)
  // 3. Normaux optimisés par distance
  // 4. Suivis en fin de tournée

  // Algorithme glouton amélioré (nearest neighbor + 2-opt)
  const ordre = [depart];
  const restants = [...critiques, ...normaux, ...suivis];
  let position = depart;

  while (restants.length > 0) {
    let meilleur = 0, minDist = Infinity;
    for (let i = 0; i < restants.length; i++) {
      const d = haversine(position, restants[i]);
      // Bonus priorité : critique = distance / 3
      const score = d / (restants[i].priorite === 'critique' ? 3 : 1);
      if (score < minDist) { minDist = score; meilleur = i; }
    }
    position = restants.splice(meilleur, 1)[0];
    ordre.push(position);
  }

  // 2-opt improvement
  return ameliorer2opt(ordre);
}
```

## Haversine (distance à vol d'oiseau)
```js
function haversine(a, b) {
  const R = 6371; // km
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
```

## Optimisation 2-opt
```js
function ameliorer2opt(route) {
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const d1 = haversine(route[i-1], route[i]) + haversine(route[j], route[(j+1) % route.length]);
        const d2 = haversine(route[i-1], route[j]) + haversine(route[i], route[(j+1) % route.length]);
        if (d2 < d1) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}
```

## Google Route Optimization API (officiel, meilleur)
```js
async function optimiserGoogle(vehicules, visites) {
  const res = await axios.post(
    'https://routeoptimization.googleapis.com/v1/projects/PROJECT_ID:optimizeTours',
    {
      model: {
        vehicles: vehicules.map(v => ({
          startLocation: { latLng: { latitude: v.lat, longitude: v.lng } },
          endLocation: { latLng: { latitude: v.lat, longitude: v.lng } },
          startTimeWindows: [{ startTime: v.heureDebut, endTime: v.heureFin }]
        })),
        shipments: visites.map(p => ({
          deliveries: [{
            arrivalLocation: { latLng: { latitude: p.lat, longitude: p.lng } },
            duration: `${p.dureeMin * 60}s`,
            timeWindows: p.fenetre ? [{ startTime: p.fenetre.debut, endTime: p.fenetre.fin }] : undefined
          }],
          label: p.patient_nom,
          penaltyCost: p.priorite === 'critique' ? 1000 : 10
        }))
      }
    },
    { headers: { Authorization: `Bearer ${await getAccessToken()}` } }
  );
  return res.data.routes;
}
```

## Fenêtres horaires JADOMI
| Type visite | Fenêtre | Durée |
|-------------|---------|-------|
| Prise de sang (à jeun) | 7h-9h | 15min |
| Insuline | 7h-8h, 12h-13h, 19h-20h | 10min |
| Pansement | Flexible | 20min |
| Perfusion | Matin préféré | 45-60min |
| Toilette | 7h-10h | 30min |
| Prélèvement labo | 7h-10h | 15min |
| Livraison labo (prothésiste) | 9h-12h, 14h-17h | 5min |

## Zones de découpage
```js
// K-means clustering pour découper en zones équilibrées
function decoupageZones(patients, nbZones) {
  // Initialiser centroïdes aléatoires
  // Itérer : assigner patients au centroïde le plus proche
  // Recalculer centroïdes
  // Jusqu'à convergence
  // Contrainte : max 20 patients/zone, rayon max 15km
}
```

## Intégration JADOMI existante
- Table `ide_tournees` : tournées planifiées
- Table `positions_livreur` : GPS temps réel coursier
- Endpoint `POST /api/ide/tournee/optimiser` : reçoit patients → retourne ordre optimal
- Carte MapLibre dans `public/admin/infirmiere.html`
