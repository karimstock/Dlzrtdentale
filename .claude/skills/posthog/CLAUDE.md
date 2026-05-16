# PostHog Analytics Skill

## Overview
PostHog est la plateforme d'analytics produit pour le tracking utilisateurs, feature flags, et event analytics sur JADOMI.

## MCP Server (recommande)
PostHog fournit un serveur MCP officiel :
```bash
claude mcp add posthog -- npx -y @posthog/mcp-server
```
Puis dans Claude Code, lancer `/mcp` et suivre les instructions de connexion.

Alternative manuelle :
```bash
claude mcp add posthog \
  -e POSTHOG_API_KEY=phx_... \
  -e POSTHOG_HOST=https://app.posthog.com \
  -- npx -y @posthog/mcp-server
```

## Authentication
Deux types de cles :
- **Project API Key** (`phc_...`) : pour le tracking cote client (capture, flags)
- **Personal API Key** (`phx_...`) : pour l'API management (lecture/ecriture complete)
- **Base URL** : `https://app.posthog.com` (ou self-hosted)
- Variables d'environnement : `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`

### Headers
```
Authorization: Bearer phx_your_personal_api_key
Content-Type: application/json
```

---

## Endpoints principaux

### 1. Capturer un evenement
```
POST https://app.posthog.com/capture/
```
```json
{
  "api_key": "phc_your_project_api_key",
  "event": "commande_validee",
  "distinct_id": "user_12345",
  "properties": {
    "montant": 1250,
    "produit": "fauteuil_roulant",
    "ville": "Roubaix",
    "$current_url": "https://jadomi.fr/checkout"
  },
  "timestamp": "2026-05-15T10:30:00Z"
}
```
Pas de rate limit sur cet endpoint.

### 2. Capture en batch
```
POST https://app.posthog.com/batch/
```
```json
{
  "api_key": "phc_your_project_api_key",
  "batch": [
    {
      "event": "page_view",
      "distinct_id": "user_123",
      "properties": { "$current_url": "/catalogue" },
      "timestamp": "2026-05-15T10:00:00Z"
    },
    {
      "event": "produit_consulte",
      "distinct_id": "user_123",
      "properties": { "produit_id": "FR-001" },
      "timestamp": "2026-05-15T10:01:00Z"
    }
  ]
}
```

### 3. Evaluer les feature flags
```
POST https://app.posthog.com/decide/?v=3
```
```json
{
  "api_key": "phc_your_project_api_key",
  "distinct_id": "user_12345",
  "groups": {}
}
```
Reponse :
```json
{
  "featureFlags": {
    "nouveau_comparateur": true,
    "promo_banner": "variant_a"
  }
}
```

### 4. API Feature Flags (CRUD)

**Lister les feature flags** :
```
GET /api/projects/{project_id}/feature_flags/
Authorization: Bearer phx_...
```

**Creer un feature flag** :
```
POST /api/projects/{project_id}/feature_flags/
```
```json
{
  "key": "nouveau_checkout",
  "name": "Nouveau flow de checkout",
  "filters": {
    "groups": [
      {
        "properties": [
          { "key": "email", "value": "@jadomi.fr", "operator": "icontains", "type": "person" }
        ],
        "rollout_percentage": 100
      }
    ]
  },
  "active": true
}
```

**Mettre a jour un feature flag** :
```
PATCH /api/projects/{project_id}/feature_flags/{flag_id}/
```

**Supprimer un feature flag** :
```
DELETE /api/projects/{project_id}/feature_flags/{flag_id}/
```

### 5. Requeter les evenements
```
GET /api/projects/{project_id}/events/?event=commande_validee&limit=100
Authorization: Bearer phx_...
```

### 6. Personnes (utilisateurs)
```
GET /api/projects/{project_id}/persons/?search=jean@example.com
```

### 7. Insights (analyses)

**Creer un trend** :
```
POST /api/projects/{project_id}/insights/trend/
```
```json
{
  "events": [{ "id": "commande_validee", "math": "total" }],
  "date_from": "-30d",
  "interval": "day"
}
```

**Creer un funnel** :
```
POST /api/projects/{project_id}/insights/funnel/
```
```json
{
  "events": [
    { "id": "page_view", "order": 0 },
    { "id": "produit_consulte", "order": 1 },
    { "id": "ajout_panier", "order": 2 },
    { "id": "commande_validee", "order": 3 }
  ],
  "date_from": "-30d",
  "funnel_window_days": 7
}
```

### 8. Annotations
```
POST /api/projects/{project_id}/annotations/
```
```json
{
  "content": "Lancement promo -20% fauteuils",
  "date_marker": "2026-05-15T00:00:00Z",
  "scope": "project"
}
```

---

## Exemple Node.js avec SDK
```javascript
const { PostHog } = require('posthog-node');
const posthog = new PostHog('phc_your_project_api_key', {
  host: 'https://app.posthog.com'
});

posthog.capture({
  distinctId: 'user_123',
  event: 'commande_validee',
  properties: { montant: 1250, produit: 'fauteuil_roulant' }
});

posthog.identify({
  distinctId: 'user_123',
  properties: { email: 'jean@example.com', nom: 'Dupont', ville: 'Roubaix' }
});

const isEnabled = await posthog.isFeatureEnabled('nouveau_comparateur', 'user_123');
await posthog.shutdown();
```

## Rate Limits
- Capture / Flags (publics) : pas de limite
- Endpoints analytics : 240/minute, 1200/heure
- Endpoint events/values : 60/minute, 300/heure

## Documentation officielle
- https://posthog.com/docs/api
- https://posthog.com/docs/feature-flags
- https://posthog.com/docs/api/capture
- https://github.com/PostHog/mcp
