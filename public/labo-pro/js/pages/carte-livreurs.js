/* ═══════════════════════════════════════════════
   JADOMI Labo — Carte Livreurs (Leaflet)
   Positions temps réel, refresh 15s
   ═══════════════════════════════════════════════ */

var _carteInterval = null;
var _carteMap = null;
var _carteMarkers = {};

function renderCartelivreursPage(container) {
  container.innerHTML = `
    <style>
      .carte-wrap{position:relative;width:100%;height:calc(100vh - 140px);border-radius:16px;overflow:hidden;border:1px solid var(--border-subtle);}
      .carte-map{width:100%;height:100%;}
      .carte-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;}
      .carte-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;}
      .carte-badge{font-size:12px;padding:4px 12px;border-radius:20px;background:rgba(34,197,94,.12);color:#4ade80;font-weight:600;}
      .carte-refresh{font-size:12px;color:var(--text-tertiary);}
      .carte-legend{position:absolute;bottom:16px;left:16px;z-index:1000;background:rgba(10,10,15,.9);backdrop-filter:blur(12px);border-radius:12px;padding:14px 18px;border:1px solid var(--border-subtle);font-size:12px;}
      .carte-legend-item{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
      .carte-legend-item:last-child{margin-bottom:0;}
      .carte-legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    </style>

    <div class="carte-header">
      <div>
        <div class="carte-title">Carte des livreurs</div>
        <div class="carte-refresh" id="carte-last-update">Actualisation automatique toutes les 15 secondes</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="carte-badge" id="carte-livreurs-count">0 livreur(s) actif(s)</span>
        <button onclick="carteRefresh()" style="padding:8px 16px;border-radius:8px;background:var(--accent-glow);border:1px solid var(--accent);color:var(--accent-light);font-size:12px;font-weight:600;cursor:pointer;">Actualiser</button>
      </div>
    </div>

    <div class="carte-wrap">
      <div class="carte-map" id="carte-livreurs-map"></div>
      <div class="carte-legend">
        <div class="carte-legend-item"><div class="carte-legend-dot" style="background:#4ade80;"></div> Livreur en tournée</div>
        <div class="carte-legend-item"><div class="carte-legend-dot" style="background:#60a5fa;"></div> Arrêt de livraison</div>
        <div class="carte-legend-item"><div class="carte-legend-dot" style="background:#fbbf24;"></div> Livreur en pause</div>
      </div>
    </div>
  `;

  // Charger Leaflet si pas déjà chargé
  if (!window.L) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = function() { initCarteLivreurs(); };
    document.head.appendChild(script);
  } else {
    setTimeout(initCarteLivreurs, 100);
  }
}

function initCarteLivreurs() {
  if (_carteMap) { _carteMap.remove(); _carteMap = null; }
  _carteMarkers = {};

  var mapEl = document.getElementById('carte-livreurs-map');
  if (!mapEl) return;

  // Centre par défaut : Lille/Roubaix
  _carteMap = L.map(mapEl, { zoomControl: true }).setView([50.6292, 3.0573], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 18
  }).addTo(_carteMap);

  // Charger les positions
  carteRefresh();

  // Refresh toutes les 15 secondes
  if (_carteInterval) clearInterval(_carteInterval);
  _carteInterval = setInterval(carteRefresh, 15000);
}

async function carteRefresh() {
  try {
    var headers = {'Content-Type':'application/json'};
    var t = window.jadomiMultiSocietes && window.jadomiMultiSocietes.token;
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var s = window._societeId || (window.jadomiMultiSocietes && window.jadomiMultiSocietes.activeSocieteId);
    if (s) headers['X-Societe-Id'] = s;

    var resp = await fetch('/api/labo/tournees/app/livreurs-positions', { headers: headers });
    if (!resp.ok) {
      // Fallback : données de démo
      carteRenderDemo();
      return;
    }
    var data = await resp.json();
    var livreurs = data.livreurs || data.positions || [];
    carteRenderLivreurs(livreurs);
  } catch(e) {
    console.warn('[carte] Erreur positions:', e.message);
    carteRenderDemo();
  }
}

function carteRenderLivreurs(livreurs) {
  if (!_carteMap) return;

  var badge = document.getElementById('carte-livreurs-count');
  if (badge) badge.textContent = livreurs.length + ' livreur' + (livreurs.length > 1 ? 's' : '') + ' actif' + (livreurs.length > 1 ? 's' : '');

  var update = document.getElementById('carte-last-update');
  if (update) update.textContent = 'Dernière mise à jour : ' + new Date().toLocaleTimeString('fr-FR');

  var colors = ['#4ade80','#60a5fa','#f59e0b','#a78bfa','#f87171'];

  livreurs.forEach(function(liv, i) {
    var lat = liv.latitude || liv.lat;
    var lng = liv.longitude || liv.lng;
    if (!lat || !lng) return;

    var color = colors[i % colors.length];
    var nom = liv.nom || liv.prenom || ('Livreur ' + (i+1));
    var key = liv.id || nom;

    if (_carteMarkers[key]) {
      _carteMarkers[key].setLatLng([lat, lng]);
    } else {
      var icon = L.divIcon({
        html: '<div style="width:32px;height:32px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🚚</div>',
        iconSize: [32,32],
        iconAnchor: [16,16],
        className: ''
      });
      _carteMarkers[key] = L.marker([lat, lng], { icon: icon })
        .addTo(_carteMap)
        .bindPopup('<strong>' + nom + '</strong><br><span style="font-size:12px;color:#666;">' + (liv.statut || 'En tournée') + '</span>');
    }
  });

  // Ajuster la vue si des livreurs existent
  if (livreurs.length > 0) {
    var bounds = [];
    livreurs.forEach(function(l) {
      if (l.latitude || l.lat) bounds.push([l.latitude || l.lat, l.longitude || l.lng]);
    });
    if (bounds.length > 0 && !_carteMap._userMoved) {
      _carteMap.fitBounds(bounds, { padding: [50,50], maxZoom: 14 });
    }
  }
}

function carteRenderDemo() {
  // Données démo : 4 livreurs autour de Lille/Roubaix
  var demo = [
    { nom:'Nordine', lat:50.6292, lng:3.0573, statut:'En tournée — 3 arrêts restants' },
    { nom:'Youssef', lat:50.6412, lng:3.0812, statut:'En livraison chez Dr. Martin' },
    { nom:'Antoine', lat:50.6180, lng:3.0455, statut:'En pause déjeuner' },
    { nom:'Mehdi', lat:50.6350, lng:3.0680, statut:'En tournée — dernier arrêt' }
  ];
  carteRenderLivreurs(demo);
}

// Cleanup quand on quitte la page
function cleanupCarteLivreurs() {
  if (_carteInterval) { clearInterval(_carteInterval); _carteInterval = null; }
  if (_carteMap) { _carteMap.remove(); _carteMap = null; }
  _carteMarkers = {};
}

// Enregistrer la route
Router.register('/carte-livreurs', renderCartelivreursPage);
