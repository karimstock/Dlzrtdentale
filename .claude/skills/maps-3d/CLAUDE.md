---
name: maps-3d
description: Cartes 3D MapLibre + Three.js — GPS temps réel, géofencing, heatmaps, tracking coursier JADOMI
---

# Maps 3D — GPS & Tracking JADOMI

## Stack JADOMI
- **MapLibre GL JS** (open-source, déjà utilisé) — carte 2D/3D
- **Three.js** (installé v0.184) — overlays 3D, particules
- **Leaflet** (installé) — carte admin simple
- **WebSocket** — positions GPS temps réel

## MapLibre — Carte de base
```js
import maplibregl from 'maplibre-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=KEY',
  center: [3.0573, 50.6292], // Roubaix
  zoom: 13,
  pitch: 45,        // inclinaison 3D
  bearing: -17.6,   // rotation
  antialias: true
});
```

## Bâtiments 3D
```js
map.on('load', () => {
  map.addLayer({
    id: '3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#aaa',
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-base': ['get', 'render_min_height'],
      'fill-extrusion-opacity': 0.6
    }
  });
});
```

## Tracking coursier temps réel (WebSocket)
```js
// Côté serveur (Node.js)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
  ws.on('message', data => {
    const { livreur_id, lat, lng, speed, heading } = JSON.parse(data);
    // Sauver en BDD
    supabase.from('positions_livreur').upsert({
      livreur_id, latitude: lat, longitude: lng,
      vitesse: speed, direction: heading,
      timestamp: new Date().toISOString()
    });
    // Broadcast à tous les clients admin
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ livreur_id, lat, lng, speed, heading }));
      }
    });
  });
});

// Côté client (admin)
const ws = new WebSocket('wss://jadomi.fr/ws/tracking');
ws.onmessage = e => {
  const pos = JSON.parse(e.data);
  updateMarker(pos.livreur_id, [pos.lng, pos.lat], pos.heading);
};
```

## Marqueur coursier animé
```js
function updateMarker(id, lngLat, heading) {
  if (!markers[id]) {
    const el = document.createElement('div');
    el.className = 'courier-marker';
    el.innerHTML = '<div class="courier-dot"></div><div class="courier-pulse"></div>';
    markers[id] = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
  } else {
    // Animation fluide
    animateMarker(markers[id], lngLat, 1000);
  }
}

function animateMarker(marker, target, duration) {
  const start = marker.getLngLat();
  const startTime = performance.now();
  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = t * (2 - t); // easeOutQuad
    marker.setLngLat([
      start.lng + (target[0] - start.lng) * ease,
      start.lat + (target[1] - start.lat) * ease
    ]);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

## Géofencing (preuve de passage IDE)
```js
function isInsideGeofence(position, patient, radiusMeters = 100) {
  const R = 6371000; // mètres
  const dLat = (patient.lat - position.lat) * Math.PI / 180;
  const dLon = (patient.lng - position.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(position.lat*Math.PI/180) * Math.cos(patient.lat*Math.PI/180) * Math.sin(dLon/2)**2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return { inside: distance <= radiusMeters, distance: Math.round(distance) };
}

// Validation preuve de passage
function validerPassage(posGPS, patient) {
  const geo = isInsideGeofence(posGPS, patient, 150); // 150m tolérance
  return {
    valide: geo.inside,
    distance: geo.distance,
    horodatage: new Date().toISOString(), // serveur, pas client
    coordonnees: posGPS,
    methode: 'geofencing_gps'
  };
}
```

## Heatmap patients
```js
map.addSource('patients-heat', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: patients.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { weight: p.priorite === 'critique' ? 3 : 1 }
    }))
  }
});

map.addLayer({
  id: 'patients-heatmap',
  type: 'heatmap',
  source: 'patients-heat',
  paint: {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': 1,
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,255,0)', 0.2, '#2563eb',
      0.4, '#0d7d6c', 0.6, '#eab308', 1, '#dc2626'
    ],
    'heatmap-radius': 30
  }
});
```

## Route animée sur la carte
```js
function animateRoute(coordinates, durationMs) {
  map.addSource('route', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
  });
  map.addLayer({
    id: 'route-line', type: 'line', source: 'route',
    paint: { 'line-color': '#0d7d6c', 'line-width': 4, 'line-opacity': 0.8 }
  });

  let i = 0;
  const step = durationMs / coordinates.length;
  const interval = setInterval(() => {
    if (i >= coordinates.length) { clearInterval(interval); return; }
    const partial = coordinates.slice(0, i + 1);
    map.getSource('route').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: partial }
    });
    i++;
  }, step);
}
```

## Three.js overlay sur MapLibre
```js
// Ajouter un custom layer Three.js sur la carte MapLibre
class ThreeJSLayer {
  constructor() { this.camera = new THREE.Camera(); this.scene = new THREE.Scene(); }
  onAdd(map, gl) {
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }
  render(gl, matrix) {
    // Synchroniser la matrice Three.js avec MapLibre
    const m = new THREE.Matrix4().fromArray(matrix);
    this.camera.projectionMatrix = m;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
```

## Tables JADOMI existantes
- `positions_livreur` : lat, lng, vitesse, direction, timestamp
- `ide_preuves_passage` : patient_id, coordonnees, horodatage, distance, methode
- `notifications_dentiste` : alerte livraison en cours
