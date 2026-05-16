---
name: google-calendar
description: Google Calendar API v3 pour agenda dentiste JADOMI — RDV, disponibilités, sync, récurrence
---

# Google Calendar — Agenda Dentiste JADOMI

## API Reference
- Base URL: `https://www.googleapis.com/calendar/v3`
- Auth: OAuth2 ou Service Account (préféré pour serveur)
- Scopes: `https://www.googleapis.com/auth/calendar`
- NPM: `googleapis` ou `google-auth-library`

## Auth Service Account (serveur Node.js)
```js
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar']
});
const calendar = google.calendar({ version: 'v3', auth });
```

## Créer un RDV dentaire
```js
async function creerRDV({ calendarId, patient, acte, dateHeure, dureeMin }) {
  const durees = {
    consultation: 30, detartrage: 30, soin_carie: 45,
    extraction: 45, endo: 60, couronne_empreinte: 45,
    implant_pose: 90, blanchiment: 60, urgence: 30
  };
  const duree = dureeMin || durees[acte] || 30;
  const start = new Date(dateHeure);
  const end = new Date(start.getTime() + duree * 60000);

  return calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `${patient.nom} — ${acte.replace(/_/g, ' ')}`,
      description: `Patient: ${patient.nom} ${patient.prenom}\nTel: ${patient.telephone}\nActe: ${acte}\nDent(s): ${patient.dents || 'N/A'}`,
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
      colorId: getColorForActe(acte),
      reminders: { useDefault: false, overrides: [
        { method: 'email', minutes: 1440 }, // J-1
        { method: 'popup', minutes: 60 }     // H-1
      ]}
    }
  });
}

function getColorForActe(acte) {
  const colors = {
    consultation: '1', detartrage: '2', soin_carie: '3',
    extraction: '4', endo: '5', couronne_empreinte: '6',
    implant_pose: '7', blanchiment: '8', urgence: '11'
  };
  return colors[acte] || '1';
}
```

## Vérifier disponibilité (FreeBusy)
```js
async function checkDispo(calendarId, dateDebut, dateFin) {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateDebut,
      timeMax: dateFin,
      timeZone: 'Europe/Paris',
      items: [{ id: calendarId }]
    }
  });
  const busy = res.data.calendars[calendarId].busy;
  return busy.length === 0; // true = disponible
}
```

## Trouver le prochain créneau libre
```js
async function prochainCreneau(calendarId, dureeMin, apresDate) {
  const events = await calendar.events.list({
    calendarId,
    timeMin: apresDate || new Date().toISOString(),
    timeMax: new Date(Date.now() + 14 * 86400000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  const jours = getJoursTravailles(); // config JADOMI
  // Algorithme : scanner chaque créneau de 30min sur 14 jours
  // Ignorer weekends, pauses déjeuner, créneaux occupés
  // Retourner le premier créneau >= dureeMin
}
```

## Sync bidirectionnelle JADOMI ↔ Google
```js
// Watch : Google notifie JADOMI des changements
async function setupWatch(calendarId, webhookUrl) {
  return calendar.events.watch({
    calendarId,
    requestBody: {
      id: `jadomi-watch-${Date.now()}`,
      type: 'web_hook',
      address: webhookUrl, // https://jadomi.fr/api/calendar/webhook
      expiration: Date.now() + 7 * 86400000 // 7 jours
    }
  });
}
```

## Récurrence (RDV hebdo ortho, suivi implant)
```js
// Tous les mardis à 10h pendant 8 semaines
const recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8'];
```

## Types RDV JADOMI dentiste
| Acte | Durée | Couleur | Priorité |
|------|-------|---------|----------|
| consultation | 30min | Bleu | Normale |
| detartrage | 30min | Vert | Normale |
| soin_carie | 45min | Violet | Normale |
| extraction | 45min | Rouge | Haute |
| endo | 60min | Jaune | Haute |
| couronne_empreinte | 45min | Orange | Normale |
| implant_pose | 90min | Bleu foncé | Très haute |
| blanchiment | 60min | Turquoise | Basse |
| urgence | 30min | Rouge vif | URGENTE |

## Jours travaillés (config JADOMI)
```js
const JOURS_DEFAUT = {
  lundi: { matin: '09:00-12:30', aprem: '14:00-19:00' },
  mardi: { matin: '09:00-12:30', aprem: '14:00-19:00' },
  mercredi: { matin: '09:00-12:30', aprem: '14:00-19:00' },
  jeudi: { matin: '09:00-12:30', aprem: '14:00-19:00' },
  vendredi: { matin: '09:00-12:30', aprem: '14:00-18:00' },
  samedi: null, dimanche: null
};
```

## MCP Server disponible
- `@anthropic/google-calendar-mcp` ou `nspady/google-calendar-mcp`
- Config .mcp.json : `{ "command": "npx", "args": ["-y", "google-calendar-mcp"] }`
