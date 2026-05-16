# Brevo (ex-Sendinblue) - Email Marketing Automation Skill

## Overview
Brevo est la plateforme d'email marketing utilisee par JADOMI. Cette skill couvre l'API REST v3 pour l'envoi d'emails transactionnels, la gestion de campagnes, contacts et segmentation.

## Authentication
- **Header**: `api-key: YOUR_BREVO_API_KEY`
- **Base URL**: `https://api.brevo.com/v3`
- Cle API disponible dans : Brevo Dashboard > Settings > SMTP & API > API Keys
- Variable d'environnement : `BREVO_API_KEY`

## MCP Server (recommande)
Un serveur MCP officiel Brevo existe. Installation :
```bash
claude mcp add brevo -- npx -y @getbrevo/mcp-server
```
Ou via le package communautaire :
```bash
npm install @getbrevo/brevo
```

---

## Endpoints principaux

### 1. Envoyer un email transactionnel
```
POST /v3/smtp/email
```
```json
{
  "sender": { "name": "JADOMI", "email": "noreply@jadomi.fr" },
  "to": [{ "email": "client@example.com", "name": "Client" }],
  "subject": "Votre commande JADOMI",
  "htmlContent": "<html><body><h1>Bonjour {{params.PRENOM}}</h1></body></html>",
  "params": { "PRENOM": "Jean" }
}
```
**Reponse** : `{ "messageId": "<202x...@smtp-relay.brevo.com>" }`

### 2. Envoyer des emails en batch
```
POST /v3/smtp/email
```
```json
{
  "sender": { "name": "JADOMI", "email": "noreply@jadomi.fr" },
  "messageVersions": [
    {
      "to": [{ "email": "client1@example.com" }],
      "params": { "PRENOM": "Marie" },
      "subject": "Offre speciale Marie"
    },
    {
      "to": [{ "email": "client2@example.com" }],
      "params": { "PRENOM": "Pierre" },
      "subject": "Offre speciale Pierre"
    }
  ],
  "htmlContent": "<html><body><h1>Bonjour {{params.PRENOM}}</h1></body></html>"
}
```
Jusqu'a 1000 versions par requete.

### 3. Gestion des contacts

**Creer un contact** :
```
POST /v3/contacts
```
```json
{
  "email": "nouveau@example.com",
  "attributes": { "PRENOM": "Jean", "NOM": "Dupont", "VILLE": "Roubaix" },
  "listIds": [5],
  "updateEnabled": true
}
```

**Recuperer un contact** :
```
GET /v3/contacts/{identifier}
```

**Mettre a jour un contact** :
```
PUT /v3/contacts/{identifier}
```
```json
{
  "attributes": { "PRENOM": "Jean-Pierre" },
  "listIds": [5, 12]
}
```

**Supprimer un contact** :
```
DELETE /v3/contacts/{identifier}
```

**Lister les contacts** :
```
GET /v3/contacts?limit=50&offset=0
```

### 4. Gestion des listes

**Creer une liste** :
```
POST /v3/contacts/lists
```
```json
{
  "name": "Clients Fauteuils Roulants",
  "folderId": 1
}
```

**Lister les listes** :
```
GET /v3/contacts/lists?limit=50&offset=0
```

**Ajouter des contacts a une liste** :
```
POST /v3/contacts/lists/{listId}/contacts/add
```
```json
{ "emails": ["a@example.com", "b@example.com"] }
```

### 5. Campagnes email

**Creer une campagne** :
```
POST /v3/emailCampaigns
```
```json
{
  "name": "Promo Janvier 2026",
  "subject": "Offres exceptionnelles JADOMI",
  "sender": { "name": "JADOMI", "email": "contact@jadomi.fr" },
  "type": "classic",
  "htmlContent": "<html>...</html>",
  "recipients": { "listIds": [5] },
  "scheduledAt": "2026-01-15T09:00:00.000Z"
}
```

**Envoyer immediatement** :
```
POST /v3/emailCampaigns/{campaignId}/sendNow
```

**Envoyer un test** :
```
POST /v3/emailCampaigns/{campaignId}/sendTest
```
```json
{ "emailTo": ["karim_bahmed@yahoo.fr"] }
```

**Recuperer les stats d'une campagne** :
```
GET /v3/emailCampaigns/{campaignId}
```

**Lister les campagnes** :
```
GET /v3/emailCampaigns?type=classic&status=sent&limit=50
```

### 6. Templates

**Creer un template** :
```
POST /v3/smtp/templates
```
```json
{
  "sender": { "name": "JADOMI", "email": "noreply@jadomi.fr" },
  "templateName": "Confirmation commande",
  "htmlContent": "<html>...</html>",
  "subject": "Confirmation de votre commande #{{params.ORDER_ID}}",
  "isActive": true
}
```

**Envoyer via template** :
```
POST /v3/smtp/email
```
```json
{
  "to": [{ "email": "client@example.com" }],
  "templateId": 42,
  "params": { "ORDER_ID": "CMD-2026-001", "PRENOM": "Jean" }
}
```

### 7. Segmentation
```
GET /v3/contacts/segments?limit=50&offset=0
```

---

## Regles JADOMI pour les emails
- **contact@jadomi.fr** : email public (formulaires, site)
- **noreply@jadomi.fr** : emails automatiques (transactionnels, confirmations)
- L'email personnel du fondateur n'est utilise QUE pour l'administration
- Zero tolerance orthographe : les accents et le francais correct sont critiques en B2B
- Toujours tester avant d'envoyer en production

## Codes HTTP
| Code | Signification |
|------|--------------|
| 201  | Cree avec succes |
| 204  | Succes sans contenu |
| 400  | Requete invalide |
| 401  | Cle API invalide |
| 404  | Ressource non trouvee |

## Headers requis
```
Content-Type: application/json
Accept: application/json
api-key: YOUR_BREVO_API_KEY
```

## Exemple Node.js avec fetch
```javascript
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BASE_URL = 'https://api.brevo.com/v3';

async function sendEmail(to, subject, htmlContent, params = {}) {
  const res = await fetch(`${BASE_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'JADOMI', email: 'noreply@jadomi.fr' },
      to: [{ email: to }],
      subject,
      htmlContent,
      params
    })
  });
  return res.json();
}
```

## Documentation officielle
- https://developers.brevo.com/
- https://developers.brevo.com/reference
