# ARCHITECTURE JADOMI DENTISTE PRO
## Passe 45 -- Schema technique propose
**Date : 25 avril 2026**

---

## 1. VUE D'ENSEMBLE

```
+--------------------------------------------------+
|              JADOMI DENTISTE PRO                  |
+--------------------------------------------------+
|                                                    |
|  +------------------+    +---------------------+  |
|  | COTE DENTISTE    |    | COTE PATIENT        |  |
|  | (Web Admin)      |    | (PWA Mobile)        |  |
|  |                  |    |                     |  |
|  | jadomi.fr/       |    | patient.jadomi.fr   |  |
|  | dentiste-pro/    |    |                     |  |
|  |                  |    | - Auth OTP tel      |  |
|  | - Dashboard      |    | - Mes RDV           |  |
|  | - Agenda         |    | - Chat cabinet      |  |
|  | - Patients       |    | - Documents         |  |
|  | - Wait list      |    | - Timeline photos   |  |
|  | - Chat           |    | - Chat IA 24/7      |  |
|  | - Stats          |    | - Notifications     |  |
|  | - Config         |    |                     |  |
|  +--------+---------+    +---------+-----------+  |
|           |                        |               |
|  +--------+------------------------+-----------+   |
|  |              BACKEND API                    |   |
|  |         jadomi.fr/api/dentiste-pro/*        |   |
|  |                                             |   |
|  |  Modules existants reutilises :             |   |
|  |  - /api/appointments (RDV)                  |   |
|  |  - /api/timeline (photos patient)           |   |
|  |  - /api/client-portal (espace patient)      |   |
|  |  - /api/coach (onboarding)                  |   |
|  |  - /api/communication (emails/SMS)          |   |
|  |  - /services/otp-sender (OTP)               |   |
|  |                                             |   |
|  |  Nouveaux modules :                         |   |
|  |  - /api/dentiste-pro/waitlist (smart queue) |   |
|  |  - /api/dentiste-pro/chat (temps reel)      |   |
|  |  - /api/dentiste-pro/chat-ia (Claude)       |   |
|  |  - /api/dentiste-pro/urgence (notif push)   |   |
|  |  - /api/dentiste-pro/stats (analytics)      |   |
|  +---------------------+----------------------+   |
|                         |                          |
|  +---------------------+----------------------+   |
|  |            SUPABASE PostgreSQL              |   |
|  |  Tables existantes + nouvelles tables       |   |
|  |  dentiste_pro_*                             |   |
|  +---------------------------------------------+  |
+--------------------------------------------------+
```

---

## 2. COTE DENTISTE (Web Admin)

### URL proposee
`jadomi.fr/dentiste-pro/` (sous-section du dashboard JADOMI existant)

Pas de site separe. Integre dans l'ecosysteme JADOMI existant via un
nouvel onglet sidebar "Dentiste Pro" dans le dashboard principal.

### Modules existants a reutiliser directement

| Module existant | Utilisation Dentiste Pro | Modification |
|----------------|------------------------|-------------|
| `/api/appointments` | Gestion creneaux + RDV | Ajouter rappels auto |
| `/api/timeline` | Suivi photo patient | Aucune (deja parfait) |
| `/api/coach` | Onboarding dentiste | Enrichir contexte |
| `/api/communication` | Emails/SMS patients | Aucune |
| `/services/otp-sender` | Auth OTP patient | Aucune |

### Nouvelles routes a creer

```
/api/dentiste-pro/
  /waitlist
    GET    /                    -- Liste attente complete
    POST   /                    -- Ajouter patient
    PATCH  /:id                 -- Modifier urgence/prefs
    DELETE /:id                 -- Retirer
    POST   /notify              -- Notifier top N patients
    GET    /scores              -- Algorithme scoring

  /chat
    GET    /conversations       -- Lister conversations
    GET    /conversations/:id   -- Messages d'une conv
    POST   /conversations/:id   -- Envoyer message
    POST   /conversations/:id/media  -- Envoyer photo/doc
    WS     /ws                  -- WebSocket temps reel

  /chat-ia
    POST   /message             -- Question patient > reponse IA
    GET    /config              -- Config base connaissance
    PUT    /config              -- Modifier FAQ/ton/sujets
    GET    /escalations         -- Questions non resolues

  /urgence
    POST   /detect-cancellation -- Detecter annulation
    POST   /notify-waitlist     -- Push aux top 5
    POST   /accept/:slotId      -- Patient accepte
    GET    /history             -- Historique recuperations

  /stats
    GET    /dashboard           -- KPIs (RDV, annulations, CA)
    GET    /waitlist-analytics  -- Perf liste attente
    GET    /patient-engagement  -- Taux utilisation app
    GET    /chat-ia-analytics   -- Questions IA + escalations
```

---

## 3. COTE PATIENT (PWA)

### URL proposee
`patient.jadomi.fr` (sous-domaine dedie)

### Stack technique recommandee

**Option retenue : Vanilla JS PWA (coherent avec le reste de JADOMI)**

Justification :
- JADOMI entier est en HTML/CSS/JS vanilla
- Pas besoin de React/Vue pour une PWA simple
- Meme equipe (Karim + Claude Code) peut maintenir
- Performance maximale (pas de framework overhead)
- Build zero (pas de webpack/vite)

```
patient.jadomi.fr/
  index.html          -- Shell PWA (SPA router)
  manifest.json       -- PWA manifest (nom, icone, theme)
  sw.js               -- Service Worker (cache, push, offline)
  css/
    patient.css       -- Design system patient
  js/
    app.js            -- Router SPA + auth
    rdv.js            -- Module RDV (creneaux, reservation)
    chat.js           -- Module chat (WebSocket)
    chat-ia.js        -- Module chat IA
    documents.js      -- Module documents
    timeline.js       -- Module suivi photos
    push.js           -- Notifications push
    offline.js        -- Cache offline-first
```

### Auth patient : telephone + OTP

```
1. Patient entre numero telephone
2. Backend envoie OTP 6 chiffres (SMS ou WhatsApp)
3. Patient saisit code
4. Backend cree/retrouve compte + JWT 30 jours
5. Refresh token auto avant expiration
6. Pas de mot de passe jamais
```

Service existant : `/services/otp-sender.js` (SMS OVH + WhatsApp Meta)
A ajouter : auth par telephone (nouveau endpoint `/api/dentiste-pro/auth/phone`)

### Notifications Push

```
1. Patient installe PWA > prompt notification
2. Frontend genere VAPID subscription
3. Backend stocke subscription (endpoint, keys)
4. Evenements declencheurs :
   - Rappel RDV J-1, J-2h
   - Message du cabinet
   - Reponse IA
   - CRENEAU URGENCE DISPO (le game changer)
5. Backend envoie via web-push npm package
```

Dependance : `web-push` (npm package, ~50 KB)
Effort : 20h (VAPID setup + endpoints + cron rappels)

### Offline-first

```
Service Worker strategy :
- Cache Shell (HTML/CSS/JS) : Cache First
- Cache API (RDV, messages) : Network First with fallback
- Cache images (photos timeline) : Cache First
- POST queue : Background Sync pour messages offline
```

---

## 4. COEUR BACKEND : NOUVEAUX COMPOSANTS

### 4.1 Smart Wait List (algorithme scoring)

```javascript
// Algorithme de score pour prioriser les patients en attente
function calculatePatientScore(patient, slot) {
  let score = 0;

  // Urgence declaree (0-100)
  score += patient.urgence_level * 40;  // max 40 pts

  // Temps d'attente (jours depuis demande)
  score += Math.min(patient.jours_attente * 2, 30);  // max 30 pts

  // Preference creneau (match jour/heure)
  if (matchPreference(patient.prefs, slot)) score += 15;

  // Proximite geographique (km)
  const km = haversine(patient.coords, cabinet.coords);
  score += Math.max(0, 10 - km);  // max 10 pts si < 10km

  // Historique (patient fidele)
  score += Math.min(patient.nb_rdv_passes, 5);  // max 5 pts

  return score;  // max theorique : 100
}
```

Tables nouvelles :
```sql
CREATE TABLE dentiste_pro_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id),
  patient_phone text NOT NULL,
  patient_nom text,
  urgence_level int DEFAULT 50 CHECK (urgence_level BETWEEN 0 AND 100),
  motif text,
  preferences jsonb DEFAULT '{}',  -- jours, creneaux, praticien
  coords point,                     -- geolocalisation
  nb_rdv_passes int DEFAULT 0,
  date_demande timestamptz DEFAULT now(),
  date_notifie timestamptz,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','notifie','place','expire','annule')),
  created_at timestamptz DEFAULT now()
);
```

Effort estime : **16h**

### 4.2 Notification Urgence (le game changer)

```
Flux complet :

1. Patient A annule RDV Mardi 14h
   → Webhook interne detecte annulation
   → Creneau marque "libere"

2. Algorithme scoring
   → SELECT top 5 patients waitlist
   → ORDER BY calculatePatientScore(patient, slot) DESC
   → LIMIT 5

3. Push simultane
   → web-push aux 5 patients
   → "CRENEAU DISPO Mardi 14h -- Accepter maintenant"
   → Timer 30 minutes

4. Premier qui clique "Accepter"
   → Transaction atomique :
     BEGIN;
     INSERT INTO appointments (...) VALUES (...);
     UPDATE waitlist SET statut = 'place' WHERE id = :id;
     COMMIT;
   → Si conflit (2 clics simultanes) : seul le premier passe
   → Push "Confirme !" au gagnant
   → Push "Desole, creneau pris" aux 4 autres

5. Logging
   → Temps de reaction moyen
   → Taux de recuperation
   → Economies estimees
```

Tables nouvelles :
```sql
CREATE TABLE dentiste_pro_urgence_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id),
  appointment_id uuid,           -- RDV annule source
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  slot_duration int NOT NULL,    -- minutes
  patients_notified uuid[],      -- IDs patients notifies
  patient_accepted uuid,         -- ID patient qui a accepte
  nb_notified int DEFAULT 0,
  accepted_at timestamptz,
  reaction_time_seconds int,     -- temps entre notif et acceptation
  statut text DEFAULT 'open' CHECK (statut IN ('open','accepted','expired')),
  expires_at timestamptz,        -- 30 min apres notification
  created_at timestamptz DEFAULT now()
);
```

Effort estime : **40h** (le composant le plus complexe)

### 4.3 Chat IA Patient

```
Architecture :
- Base connaissance par cabinet (JSON configurable)
- Claude Haiku pour reponses rapides (cout ~0.001$/message)
- Escalade automatique si confiance < 70%
- Historique conversations stocke

Base connaissance type :
{
  "cabinet": {
    "nom": "Dr Bahmed - Precision Dentaire",
    "adresse": "...",
    "horaires": { "lundi": "9h-18h", ... },
    "telephone": "...",
    "mutuelles": ["MGEN", "Harmonie", ...],
    "cmu": true
  },
  "faq": [
    { "q": "Premier RDV enfant", "r": "A partir de 3 ans..." },
    { "q": "Urgence dentaire", "r": "Appelez le 01..." },
    ...
  ],
  "services": ["implants", "orthodontie", "blanchiment", ...],
  "consignes_pre_operatoires": { ... }
}
```

Service existant reutilisable : `/api/vitrines/chatbot-public.js`
(meme pattern : Claude + config site + rate limiting + escalade)

Effort estime : **24h** (adaptation du chatbot vitrines existant)

### 4.4 Chat Direct Dentiste-Patient

```
Options techniques :

Option A : WebSocket (ws npm)
  + Temps reel veritable
  + Indication "en train d'ecrire"
  - Necessite gestion connexions
  - Plus complexe

Option B : SSE + POST (comme le chatbot actuel)
  + Plus simple
  + Fonctionne derriere CDN/proxy
  + Deja utilise dans JADOMI (chat vitrines)
  - Unidirectionnel (patient poll ou SSE pour recevoir)

RECOMMANDATION : Option B pour Phase A (simplicite)
                  Option A pour Phase C (scale)
```

Effort estime : **24h** (SSE) ou **40h** (WebSocket)

---

## 5. INTEGRATION LOGICIELS METIER

### Logiciels cibles prioritaires

| Logiciel | Part marche FR | Type API | Faisabilite |
|----------|---------------|----------|-------------|
| LOGOS_w (Julie Solutions) | ~35% | Pas d'API publique | Import/export fichiers |
| Julie (Julie Solutions) | ~25% | Pas d'API publique | Import/export fichiers |
| Maevi (Visiodent) | ~15% | Pas d'API publique | Import/export fichiers |
| Doctolib | ~60% RDV | API limitee (partenaires) | Webhook calendrier possible |

### Strategie d'integration recommandee

**Phase A : Import/Export fichiers**
- Export CSV patients depuis logiciel metier
- Import dans JADOMI via drag-drop (comme contacts_cabinet)
- Sync manuelle periodique
- Effort : 8h

**Phase B : Sync calendrier**
- Feed iCal/CalDAV depuis logiciel metier
- JADOMI lit les creneaux occupes
- Pas besoin d'API proprietaire
- Effort : 16h

**Phase C : API Segur du Numerique**
- DMP (Dossier Medical Partage) -- consultation
- MSSante (Messagerie Securisee de Sante) -- envoi documents
- INS (Identite Nationale de Sante) -- verification identite
- Necessite : certification, carte CPS, convention CNAM
- Effort : 200h+ (projet a part entiere)

**Phase D : Partenariats directs**
- Contacter Julie Solutions / Visiodent pour API partenaire
- Negocier acces lecture agenda + patients
- Modele : JADOMI = partenaire technologique, pas concurrent
- Position : "JADOMI complete votre logiciel, ne le remplace pas"

---

## 6. SCHEMA BASE DE DONNEES (nouvelles tables Phase A)

```sql
-- ==========================================
-- JADOMI DENTISTE PRO -- Schema Phase A
-- ==========================================

-- Patients app (auth par telephone)
CREATE TABLE dentiste_pro_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES societes(id),
  telephone text NOT NULL,
  nom text,
  prenom text,
  email text,
  date_naissance date,
  push_subscription jsonb,      -- VAPID subscription
  preferences jsonb DEFAULT '{}',
  derniere_connexion timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(societe_id, telephone)
);

-- Liste d'attente intelligente
CREATE TABLE dentiste_pro_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES societes(id),
  patient_id uuid REFERENCES dentiste_pro_patients(id),
  urgence_level int DEFAULT 50,
  motif text,
  preferences_jours text[],
  preferences_heures text[],
  coords point,
  statut text DEFAULT 'en_attente',
  date_demande timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Creneaux urgence (annulations recuperees)
CREATE TABLE dentiste_pro_urgence_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES societes(id),
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  slot_duration int NOT NULL,
  patients_notified uuid[],
  patient_accepted uuid REFERENCES dentiste_pro_patients(id),
  reaction_time_seconds int,
  statut text DEFAULT 'open',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Chat dentiste-patient
CREATE TABLE dentiste_pro_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES societes(id),
  patient_id uuid NOT NULL REFERENCES dentiste_pro_patients(id),
  sender_role text NOT NULL CHECK (sender_role IN ('dentiste','patient','ia')),
  content text,
  media_url text,
  media_type text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Config chat IA par cabinet
CREATE TABLE dentiste_pro_ia_config (
  societe_id uuid PRIMARY KEY REFERENCES societes(id),
  cabinet_info jsonb DEFAULT '{}',
  faq jsonb DEFAULT '[]',
  ton text DEFAULT 'professionnel',
  sujets_autorises text[],
  escalation_threshold float DEFAULT 0.7,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Rappels RDV
CREATE TABLE dentiste_pro_rappels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  patient_id uuid REFERENCES dentiste_pro_patients(id),
  type text CHECK (type IN ('j-2','j-1','h-2')),
  canal text CHECK (canal IN ('push','sms','email')),
  envoye boolean DEFAULT false,
  envoye_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Stats et analytics
CREATE TABLE dentiste_pro_events (
  id bigserial PRIMARY KEY,
  societe_id uuid NOT NULL,
  event_type text NOT NULL,  -- rdv_book, rdv_cancel, urgence_notif, urgence_accept, chat_msg, ia_msg
  patient_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index performances
CREATE INDEX idx_waitlist_societe ON dentiste_pro_waitlist(societe_id, statut);
CREATE INDEX idx_messages_conv ON dentiste_pro_messages(societe_id, patient_id, created_at);
CREATE INDEX idx_urgence_open ON dentiste_pro_urgence_slots(societe_id, statut, expires_at);
CREATE INDEX idx_events_societe ON dentiste_pro_events(societe_id, event_type, created_at);
```

Total : **7 nouvelles tables** + indexes

---

## 7. ESTIMATION EFFORT PHASE A

| Composant | Heures | Priorite |
|-----------|--------|----------|
| PWA shell + manifest + sw.js | 16h | P0 |
| Auth telephone + OTP | 16h | P0 |
| Adaptation RDV (simplifier booking) | 8h | P0 |
| Rappels auto (cron J-1/H-2) | 8h | P1 |
| Chat direct (SSE Phase A) | 24h | P1 |
| Chat IA patient (adapt chatbot) | 24h | P1 |
| Liste attente smart + scoring | 16h | P1 |
| Notif urgence annulation | 40h | P2 |
| Dashboard dentiste enrichi | 12h | P2 |
| Notifications push (VAPID) | 20h | P1 |
| Integration import CSV patients | 8h | P2 |
| Tests + debug + polish | 20h | P0 |
| **TOTAL PHASE A** | **~210h** | |

Avec un rythme de 4-6h/jour Claude Code : **5-7 semaines**

---

## 8. DECISIONS TECHNIQUES RECOMMANDEES

1. **Vanilla JS PWA** (pas React/Vue) -- coherence avec le reste
2. **SSE pour chat** en Phase A, WebSocket en Phase C
3. **Claude Haiku** pour chat IA (cout minimal ~0.001$/msg)
4. **web-push npm** pour notifications (standard VAPID)
5. **Sous-domaine patient.jadomi.fr** (separation claire)
6. **Tables prefixees dentiste_pro_*** (pas de conflit)
7. **Pas de HDS Phase A** (cabinet Karim uniquement)
8. **R2 pour medias** (pas filesystem local)
9. **Import CSV Phase A** pour sync logiciel metier (pas d'API)
10. **PostgreSQL advisory locks** pour le "premier arrive" urgence
