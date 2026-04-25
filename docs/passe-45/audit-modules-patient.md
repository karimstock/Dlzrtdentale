# AUDIT MODULES PATIENT JADOMI
## Passe 45 -- Pre-etude JADOMI Dentiste Pro
**Date : 25 avril 2026**

---

## SYNTHESE EXECUTIVE

JADOMI possede deja **5 modules patient/client** fonctionnels en production,
couvrant environ **60-65% des besoins** de JADOMI Dentiste Pro.

| Module | Statut | Reutilisable pour Dentiste Pro |
|--------|--------|-------------------------------|
| Appointments (RDV) | FONCTIONNEL | OUI -- base solide |
| Client Portal | FONCTIONNEL | OUI -- a adapter |
| Timeline (suivi patient) | FONCTIONNEL | OUI -- tel quel |
| Coach (onboarding) | FONCTIONNEL | OUI -- contexte dentiste existe |
| Communication Cabinet | FONCTIONNEL | OUI -- a enrichir |

---

## MODULE 1 : APPOINTMENTS (Prise de RDV)

### Identification
- **Backend** : `/api/appointments/index.js` (27 KB, 806 lignes, 15 endpoints)
- **Frontend** : `/public/vitrines/rendez-vous.html` (44 KB)
- **SQL** : `sql/vitrines/28_appointments.sql`
- **Mount** : `server.js` ligne 501 -- `/api/appointments`

### Tables Supabase
- `appointments` -- RDV reserves (date, heure, duree, statut, client)
- `appointment_types` -- Types consultation (nom, duree, prix, couleur)
- `availability_slots` -- Creneaux recurrents + ponctuels
- `appointment_settings` -- Config (buffer, max/jour, auto-confirm, rappels)

### Features actives
- Booking public multi-etapes (type > date > creneau > coordonnees)
- Export .ics + lien Google Calendar
- Email confirmation automatique
- Calcul disponibilite (duree + buffer + deja reserves)
- Prevention double-booking
- Mode auto-confirm ou attente validation
- Limite max RDV/jour
- Soft-delete types consultation
- Admin dashboard complet (CRUD types, slots, RDV, settings)

### Features partiellement implementees
- Rappels J-1/J-2h : structure prevue dans settings mais envoi non cable
- Annulation patient : possible cote admin uniquement

### Adaptabilite Dentiste Pro
| Besoin Dentiste Pro | Existant | Effort |
|---------------------|----------|--------|
| Patient voit creneaux | OUI | 0h |
| Reserve en 2 clics | OUI (5 etapes, simplifiable) | 4h |
| Confirmation auto | OUI | 0h |
| Rappels J-1, J-2h | STRUCTURE existe, envoi manquant | 8h |
| Reprogrammation patient | NON | 12h |
| Sync calendrier dentiste | Export .ics existe, sync bidirectionnelle NON | 20h |
| Liste d'attente smart | NON (existe dans module Services) | 16h |
| Notif urgence annulation | NON -- C'EST LE GAME CHANGER | 40h |

### Bug critique identifie
Le module Services (`/api/services/agenda.js`) utilise `societe_id` dans les
requetes mais le schema SQL n'a que `profil_id`. Impact : toutes les requetes
agenda Services echouent. A corriger si on reutilise le module Services.

---

## MODULE 2 : CLIENT PORTAL (Portail Client)

### Identification
- **Backend generique** : `/api/client-portal/index.js` (15 KB, 456 lignes, 8 endpoints)
- **Backend avocat** : `/api/avocat/espace-client.js` (15 KB, 342 lignes, 9 endpoints)
- **Frontend** : `/public/vitrines/espace-client.html` + `/public/avocat/espace-client.html`
- **SQL** : `sql/vitrines/27_client_portal.sql` + `sql/vitrines/48_avocat_expert_coffre.sql`

### Tables Supabase (Generique)
- `client_accounts` -- Comptes patients (email, password PBKDF2, nom, tel)
- `client_dossiers` -- Dossiers/cas (reference, titre, statut)
- `client_documents` -- Documents uploades (R2, chiffres)
- `client_messages` -- Messages dans dossier

### Tables Supabase (Avocat - plus avance)
- `avocat_clients` -- Avec invitation, lockout, RGPD, 2FA
- `avocat_dossiers` -- Types, statuts granulaires
- `avocat_coffre_documents` -- Chiffrement AES-256-GCM complet
- `avocat_coffre_commentaires` -- Thread par document
- `avocat_coffre_audit` -- Audit trail 10 ans

### Features actives
- Inscription email/password avec PBKDF2 (100k iterations)
- Login JWT custom (HMAC-SHA256, 24h)
- Upload documents R2 (20 MB generique, 100 MB avocat)
- Download via URL presignee (1h expiry)
- Messagerie par dossier
- Workflow invitation (token 7 jours, usage unique)
- Lockout anti-brute-force (5 tentatives = 15 min)
- Consentement RGPD avec IP tracking
- Chiffrement AES-256-GCM documents (avocat)
- Audit trail complet (avocat)

### Adaptabilite Dentiste Pro
| Besoin Dentiste Pro | Existant | Effort |
|---------------------|----------|--------|
| Espace patient securise | OUI (client-portal) | 4h adaptation |
| Documents (ordo, devis) | OUI (upload/download chiffre) | 2h |
| Photos avant/apres | Via Timeline module (voir ci-dessous) | 0h |
| Auth telephone + OTP | OTP existe (avocat), auth tel NON | 16h |
| Chat direct dentiste-patient | Messages existent, pas temps reel | 24h |
| Notifications push | NON | 20h |
| PWA installable | sw.js basique existe (amilo-v1) | 16h |

---

## MODULE 3 : TIMELINE (Suivi Patient)

### Identification
- **Backend** : `/api/timeline/index.js` (37 KB, 1067 lignes, 20 endpoints)
- **Frontend praticien** : `/public/vitrines/timelines.html`
- **Frontend patient** : `/public/vitrines/mes-traitements.html`
- **SQL** : `sql/vitrines/30_timeline.sql`

### Tables Supabase
- `treatment_timelines` -- 37 champs : patient, type traitement, consentement, visibilite
- `timeline_steps` -- Etapes chronologiques avec notes cliniques + mesures
- `timeline_photos` -- Photos R2 + thumbnails WebP + labels Claude Vision

### Features actives (KILLER MODULE)
- Documentation chronologique avec photos + notes cliniques
- Upload bulk photos (10 max, 15 MB, conversion WebP auto)
- Claude Vision : detection visage, suggestion crop, labels auto
- Claude Sonnet : generation notes cliniques IA depuis photos
- Consentement patient (signature + IP + user-agent + timestamp)
- Revocation consentement possible
- Portfolio anonymise public (pour vitrine cabinet)
- Rapport PDF auto-genere avec photos integrees
- 12 types traitement (orthodontie, implant, facettes, blanchiment...)
- 3 modes visibilite (private, shared, portfolio)

### Adaptabilite Dentiste Pro
**CE MODULE EST DIRECTEMENT REUTILISABLE TEL QUEL.**
- Deja concu pour les dentistes
- Photos avant/apres = feature killer de JADOMI Dentiste Pro
- Consentement RGPD integre
- Portfolio anonymise = marketing gratuit pour le cabinet
- IA Vision = gain de temps enorme
- **Effort adaptation : 0h** (juste brancher sur la PWA patient)

---

## MODULE 4 : COACH (Onboarding)

### Identification
- **Backend** : `/api/coach/index.js` (11 KB, 360 lignes, 11 endpoints)
- **Frontend** : `public/js/coach-bootstrap.js` + `coach-tour-guide.js` + `coach-welcome.js` + `coach-tooltips.js`
- **Contextes** : `lib/coach/profession-contexts.js` (23 KB) + `lib/coach/tour-steps.js` (27 KB)
- **SQL** : `sql/vitrines/29_user_onboarding_state.sql`

### Features actives
- Welcome modal 3 etapes personnalise par profession
- Tour guide interactif SVG spotlight (Intercom-style)
- Tooltips contextuels (memorisation vus/pas vus)
- 10 profils metier dont dentiste complet
- Memorisation etat onboarding en BDD
- Toggle on/off tooltips
- Bouton "Refaire le tour"

### Adaptabilite Dentiste Pro
| Besoin | Existant | Effort |
|--------|----------|--------|
| Onboarding dentiste admin | OUI (contexte dentiste existe) | 2h enrichissement |
| Onboarding patient PWA | NON (a creer) | 12h |
| Guide premiere utilisation app | NON | 8h |

---

## MODULE 5 : COMMUNICATION CABINET

### Identification
- **Backend** : `/api/multiSocietes/communication.js` (17 KB, 9 endpoints)
- **Notifications** : `/api/multiSocietes/notifications.js` (4.7 KB, 5 endpoints)
- **OTP** : `/services/otp-sender.js` (4.8 KB)
- **Mailer** : `/api/multiSocietes/mailer.js` + `/api/emailService.js`

### Features actives
- Contacts confreres + patients (import CSV)
- Campagnes email (template HTML, tracking ouverture)
- Notifications in-app (urgences, factures, stock)
- OTP multi-canal (email, SMS OVH, WhatsApp Meta)
- Desabonnement RGPD tokenise
- Rate limiting 50 emails/minute (OVH)

### Adaptabilite Dentiste Pro
| Besoin | Existant | Effort |
|--------|----------|--------|
| Email patient | OUI | 0h |
| SMS patient | OUI (OVH SMS) | 2h config |
| WhatsApp | OUI (Meta Cloud API) | 2h config |
| Notifications push | NON | 20h (service worker + VAPID) |
| Chat temps reel | NON (pas de WebSocket/SSE patient) | 30h |
| Chiffrement bout-en-bout chat | NON | 40h |

---

## BILAN GLOBAL : CE QU'ON A vs CE QU'IL MANQUE

### DEJA CONSTRUIT (~60-65% du produit)
- Systeme RDV complet avec booking public
- Portail client securise avec documents chiffres
- Timeline patient avec photos IA (KILLER)
- Onboarding intelligent par profession
- Communication multi-canal (email, SMS, WhatsApp)
- OTP verification multi-canal
- Chiffrement AES-256-GCM documents
- Auth PBKDF2 + JWT custom
- Notifications in-app

### A CREER (~35-40% restant)
1. **PWA Patient** (shell, service worker, manifest, offline) -- 40h
2. **Auth telephone + OTP** (pas de mot de passe patient) -- 16h
3. **Chat temps reel chiffre** (WebSocket ou SSE bidirectionnel) -- 40h
4. **Notifications push** (VAPID keys, service worker push) -- 20h
5. **Liste attente smart** (algorithme scoring urgence) -- 16h
6. **Notif urgence annulation** (algo + push simultanee + premier arrive) -- 40h
7. **Rappels RDV auto** (J-1, J-2h, cron ou queue) -- 8h
8. **Sync calendrier** (CalDAV ou iCal feed temps reel) -- 20h
9. **Chat IA patient** (Claude + base connaissance cabinet) -- 24h
10. **Dashboard dentiste enrichi** (stats, analytics, wait list) -- 20h

### Estimation totale Phase A : ~120-160h de dev
Avec les modules existants, c'est **2x plus rapide** que de partir de zero
(estimation from-scratch : ~300-400h).

---

## RISQUES IDENTIFIES

1. **HDS obligatoire** des Phase B (multi-cabinets externes)
   - Phase A sur cabinet Karim uniquement = pas d'obligation HDS
   - Budget Phase B : OVH HDS ~800-1500 EUR/mois

2. **Service Worker actuel trop basique**
   - `sw.js` utilise le nom "amilo-v1" (ancien projet ?)
   - A refaire completement pour PWA Dentiste Pro

3. **Bug module Services** (societe_id manquant)
   - Impact si on reutilise la liste d'attente du module Services
   - Fix : ajouter societe_id aux tables services_* ou refactorer les queries

4. **Pas de WebSocket**
   - Chat temps reel necessite WebSocket ou SSE bidirectionnel
   - Ajout ws ou socket.io necessaire

5. **Stockage local fichiers avocat**
   - Documents avocat stockes sur filesystem local (/uploads/coffre/)
   - Pour Dentiste Pro : utiliser R2 exclusivement (scalabilite)
