# Slack Automation Skill

## Overview
Skill pour l'automatisation Slack : envoi de notifications, gestion de channels, messages, et integration avec les workflows JADOMI.

## MCP Server (recommande)
Le serveur MCP officiel Slack est la methode recommandee :
```bash
claude mcp add slack \
  -e SLACK_BOT_TOKEN=xoxb-your-bot-token \
  -e SLACK_TEAM_ID=T0123456789 \
  -- npx -y @modelcontextprotocol/server-slack
```

### Package npm officiel
```bash
npm install @slack/web-api
```

## Authentication
- **Bot Token** : `xoxb-...` (Bot User OAuth Token)
- **User Token** : `xoxp-...` (pour actions au nom d'un utilisateur)
- **Variable d'environnement** : `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`
- Base URL API : `https://slack.com/api/`

### Scopes requis pour le bot
- `chat:write` - Envoyer des messages
- `channels:read` - Lister les channels
- `channels:history` - Lire l'historique
- `users:read` - Lire les infos utilisateurs
- `files:write` - Uploader des fichiers
- `reactions:write` - Ajouter des reactions

---

## Endpoints principaux (Web API)

### 1. Envoyer un message
```
POST https://slack.com/api/chat.postMessage
Authorization: Bearer xoxb-...
Content-Type: application/json
```
```json
{
  "channel": "C0123456789",
  "text": "Nouvelle commande JADOMI recue !",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Nouvelle commande* #CMD-2026-042\nClient: Jean Dupont\nMontant: 1 250 EUR"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Voir la commande" },
          "url": "https://jadomi.fr/admin/orders/42"
        }
      ]
    }
  ]
}
```

### 2. Envoyer un message dans un thread
```json
{
  "channel": "C0123456789",
  "thread_ts": "1234567890.123456",
  "text": "Mise a jour : commande expediee"
}
```

### 3. Programmer un message
```
POST https://slack.com/api/chat.scheduleMessage
```
```json
{
  "channel": "C0123456789",
  "text": "Rappel : reunion equipe a 14h",
  "post_at": 1735689600
}
```

### 4. Lister les channels
```
GET https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200
```
Reponse paginee : suivre `response_metadata.next_cursor` jusqu'a vide.

### 5. Recuperer l'historique d'un channel
```
GET https://slack.com/api/conversations.history?channel=C0123456789&limit=100
```

### 6. Chercher des messages
```
GET https://slack.com/api/search.messages?query=jadomi+commande&count=20
```
Necessite un User Token (`xoxp-...`).

### 7. Uploader un fichier
```
POST https://slack.com/api/files.uploadV2
```
```json
{
  "channel_id": "C0123456789",
  "filename": "rapport-mensuel.pdf",
  "file": "<binary>",
  "initial_comment": "Rapport mensuel JADOMI - Mai 2026"
}
```

### 8. Gestion des reactions
```
POST https://slack.com/api/reactions.add
```
```json
{
  "channel": "C0123456789",
  "timestamp": "1234567890.123456",
  "name": "white_check_mark"
}
```

### 9. Infos utilisateur
```
GET https://slack.com/api/users.info?user=U0123456789
```

### 10. Creer un channel
```
POST https://slack.com/api/conversations.create
```
```json
{
  "name": "jadomi-alertes-commandes",
  "is_private": false
}
```

---

## Exemple Node.js avec @slack/web-api
```javascript
const { WebClient } = require('@slack/web-api');
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Envoyer une notification
async function notifyOrder(channelId, order) {
  await slack.chat.postMessage({
    channel: channelId,
    text: `Nouvelle commande #${order.id}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Commande #${order.id}*\nClient: ${order.client}\nMontant: ${order.total} EUR`
        }
      }
    ]
  });
}

// Lister tous les channels
async function listAllChannels() {
  const channels = [];
  let cursor;
  do {
    const result = await slack.conversations.list({ limit: 200, cursor });
    channels.push(...result.channels);
    cursor = result.response_metadata?.next_cursor;
  } while (cursor);
  return channels;
}
```

## Exemple avec fetch (sans SDK)
```javascript
async function postSlackMessage(channel, text) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ channel, text })
  });
  return res.json();
}
```

## Webhooks entrants (alternative simple)
Pour des notifications unidirectionnelles simples :
```javascript
async function sendWebhook(webhookUrl, message) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });
}
```

## Codes d'erreur courants
| Erreur | Signification |
|--------|--------------|
| `channel_not_found` | Channel ID invalide |
| `not_in_channel` | Le bot n'est pas dans le channel |
| `invalid_auth` | Token invalide |
| `missing_scope` | Scope OAuth manquant |
| `ratelimited` | Trop de requetes (respecter Retry-After) |

## Rate Limits
- Tier 1 : 1 requete/seconde (ex: chat.postMessage)
- Tier 2 : 20 requetes/minute
- Tier 3 : 50 requetes/minute
- Toujours respecter le header `Retry-After` en cas de 429

## Documentation officielle
- https://api.slack.com/methods
- https://docs.slack.dev/tools/node-slack-sdk/web-api/
- https://api.slack.com/block-kit
