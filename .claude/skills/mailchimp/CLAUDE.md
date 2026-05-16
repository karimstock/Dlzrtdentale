# Mailchimp Email Marketing Skill

## Overview
Mailchimp Marketing API v3 pour la gestion de campagnes email, audiences, membres et automations.

## MCP Server (recommande)
```bash
claude mcp add mailchimp -- npx -y mailchimp-mcp-server
```
Variable d'environnement requise : `MAILCHIMP_API_KEY`

## Authentication
- **API Key** : generee dans Mailchimp > Account > Extras > API Keys
- Le suffixe de la cle indique le data center (ex: `abc123-us21` => dc = `us21`)
- **Base URL** : `https://<dc>.api.mailchimp.com/3.0/`
- Auth : Bearer token
- Variable d'environnement : `MAILCHIMP_API_KEY`

### Headers
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

---

## Endpoints principaux

### 1. Ping (verification connexion)
```
GET /3.0/ping
```

### 2. Audiences (listes)

**Lister** : `GET /3.0/lists?count=50&offset=0`

**Creer** :
```
POST /3.0/lists
```
```json
{
  "name": "Clients JADOMI",
  "contact": {
    "company": "JADOMI",
    "address1": "Roubaix",
    "city": "Roubaix",
    "state": "Nord",
    "zip": "59100",
    "country": "FR"
  },
  "permission_reminder": "Vous recevez cet email car vous etes client JADOMI",
  "campaign_defaults": {
    "from_name": "JADOMI",
    "from_email": "contact@jadomi.fr",
    "subject": "",
    "language": "fr"
  },
  "email_type_option": true
}
```

### 3. Membres (contacts)

**Upsert** : `PUT /3.0/lists/{list_id}/members/{md5_email_lowercase}`
```json
{
  "email_address": "jean@example.com",
  "status_if_new": "subscribed",
  "merge_fields": { "FNAME": "Jean", "LNAME": "Dupont", "CITY": "Roubaix" },
  "tags": ["client", "fauteuil-roulant"]
}
```

**Lister** : `GET /3.0/lists/{list_id}/members?count=100&offset=0&status=subscribed`

**Rechercher** : `GET /3.0/search-members?query=jean@example.com`

**Archiver** : `DELETE /3.0/lists/{list_id}/members/{subscriber_hash}`

**Supprimer** : `POST /3.0/lists/{list_id}/members/{subscriber_hash}/actions/delete-permanent`

### 4. Tags
```
POST /3.0/lists/{list_id}/members/{subscriber_hash}/tags
```
```json
{
  "tags": [
    { "name": "client-premium", "status": "active" },
    { "name": "prospect", "status": "inactive" }
  ]
}
```

### 5. Campagnes

**Lister** : `GET /3.0/campaigns?count=50&status=sent`

**Creer** :
```
POST /3.0/campaigns
```
```json
{
  "type": "regular",
  "recipients": { "list_id": "abc123def" },
  "settings": {
    "subject_line": "Offres JADOMI - Mai 2026",
    "preview_text": "Decouvrez nos nouveaux fauteuils",
    "title": "Campagne Mai 2026",
    "from_name": "JADOMI",
    "reply_to": "contact@jadomi.fr"
  }
}
```

**Contenu** : `PUT /3.0/campaigns/{campaign_id}/content`
```json
{ "html": "<html><body><h1>Offres JADOMI</h1></body></html>" }
```

**Envoyer** : `POST /3.0/campaigns/{campaign_id}/actions/send`

**Programmer** : `POST /3.0/campaigns/{campaign_id}/actions/schedule`
```json
{ "schedule_time": "2026-05-20T09:00:00+00:00" }
```

**Tester** : `POST /3.0/campaigns/{campaign_id}/actions/test`
```json
{ "test_emails": ["karim_bahmed@yahoo.fr"], "send_type": "html" }
```

### 6. Rapports
```
GET /3.0/reports/{campaign_id}
```

### 7. Segments
```
POST /3.0/lists/{list_id}/segments
```
```json
{
  "name": "Clients Roubaix",
  "options": {
    "match": "all",
    "conditions": [
      { "condition_type": "TextMerge", "field": "CITY", "op": "is", "value": "Roubaix" }
    ]
  }
}
```

### 8. Templates
**Lister** : `GET /3.0/templates?count=50`
**Creer** : `POST /3.0/templates` avec `{ "name": "...", "html": "..." }`

---

## Exemple Node.js
```javascript
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const DC = MAILCHIMP_API_KEY.split('-')[1];
const BASE_URL = `https://${DC}.api.mailchimp.com/3.0`;
const crypto = require('crypto');

function subscriberHash(email) {
  return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
}

async function mcFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MAILCHIMP_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return res.json();
}

async function upsertContact(listId, email, mergeFields = {}, tags = []) {
  const hash = subscriberHash(email);
  const result = await mcFetch(`/lists/${listId}/members/${hash}`, {
    method: 'PUT',
    body: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed',
      merge_fields: mergeFields
    })
  });
  if (tags.length > 0) {
    await mcFetch(`/lists/${listId}/members/${hash}/tags`, {
      method: 'POST',
      body: JSON.stringify({
        tags: tags.map(t => ({ name: t, status: 'active' }))
      })
    });
  }
  return result;
}
```

## Pagination
`count` et `offset` sur tous les GET. Champ `total_items` dans la reponse.

## Rate Limits
- 10 connexions simultanees max
- Respecter `Retry-After` en cas de 429

## Regles JADOMI
- **contact@jadomi.fr** : email public
- **noreply@jadomi.fr** : emails automatiques
- Zero tolerance orthographe
- Toujours tester avant envoi

## Documentation officielle
- https://mailchimp.com/developer/marketing/api/
- https://mailchimp.com/developer/marketing/docs/fundamentals/
