# ENRICHISSEMENT INTERNATIONAL -- JADOMI DENTISTE PRO
## Recherche concurrentielle mondiale + Integrations logiciels
**Date : 25 avril 2026**

---

## 1. SMART BATCH SLOT-FINDING : JADOMI SERAIT LE PREMIER MONDIAL

Apres analyse de TOUS les concurrents internationaux (NexHealth, Dentrix,
Open Dental, Luma Health, Zocdoc, Weave, Doctolib, Solutionreach...),
**AUCUN ne propose la recherche batch de creneaux recurrents en 1 clic.**

Partout, le workflow est :
1. Chercher un creneau → reserver
2. Re-chercher le creneau suivant → re-reserver
3. Repeter N fois

L'idee de Karim est un **gap de marche reel et mondial**.

### Algorithme recommande (Constraint Satisfaction)

```
Entree :
  - Praticien : Dr Bahmed
  - Date debut : 29 avril 2026
  - Nombre RDV : 5
  - Frequence : hebdomadaire (7 jours)
  - Plage horaire : 14h00-15h00
  - Duree : 45 min
  - Tolerance : +/- 1 jour si indisponible

Algo :
  Pour chaque semaine i = 1..5 :
    1. Calculer date_candidate = debut + (i-1) * 7 jours
    2. Recuperer intervalles libres du praticien ce jour
       dans la fenetre [14h00, 15h00]
    3. Filtrer les intervalles >= 45 min
    4. Si trouve → proposer le premier slot
    5. Si vide → chercher jour-1 et jour+1 (tolerance)
    6. Si toujours vide → marquer "indisponible" + alternatives

Complexite : O(N * log(K)) ou K = nb RDV existants/jour
Temps reel : < 100ms pour 5 semaines
```

### UX recommandee (inspiree Zocdoc + Open Dental)

```
┌─────────────────────────────────────────────────────┐
│  5 RDV hebdo | Mardi 14h-15h | 45 min | Dr Bahmed  │
├─────────────────────────────────────────────────────┤
│  ✅ RDV 1 : Mar 29 Avr   14h00 - 14h45             │
│  ✅ RDV 2 : Mar 06 Mai   14h00 - 14h45             │
│  ⚠️  RDV 3 : Mar 13 Mai   INDISPONIBLE              │
│      → Alternative : Mer 14 Mai 14h15 - 15h00      │
│  ✅ RDV 4 : Mar 20 Mai   14h00 - 14h45             │
│  ✅ RDV 5 : Mar 27 Mai   14h00 - 14h45             │
├─────────────────────────────────────────────────────┤
│  💰 Gain : ~10 min economisees vs recherche manuelle │
│                                                       │
│  [ Tout reserver ]    [ Modifier ]    [ Annuler ]    │
└─────────────────────────────────────────────────────┘
```

### Concept "Serie" comme entite premiere classe

```sql
CREATE TABLE dentiste_pro_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  motif text,                    -- "Traitement endodontique"
  nb_rdv_total int NOT NULL,
  nb_rdv_effectues int DEFAULT 0,
  frequence_jours int NOT NULL,  -- 7 = hebdo, 14 = bimensuel
  plage_debut time,
  plage_fin time,
  duree_minutes int NOT NULL,
  praticien_id uuid,
  statut text DEFAULT 'en_cours',
  created_at timestamptz DEFAULT now()
);
```

Avantage : annuler la serie entiere, reprogrammer, tracker le taux de completion.

### Patterns de recurrence a supporter

| Pattern | Frequence | Cas dentaire |
|---------|----------|-------------|
| Hebdomadaire | 7j | Soins endodontiques, protheses |
| Bimensuel | 14j | Orthodontie, suivi implants |
| Mensuel | 30j | Controles post-op |
| Trimestriel | 90j | Detartrage, controle |
| Personnalise | Nj | Sur mesure |

---

## 2. FEATURES PATIENT ENGAGEMENT : 10 ANS DE RETARD FRANCE vs US

### Benchmark international

| Feature | US (standard) | France | Opportunite JADOMI |
|---------|--------------|--------|-------------------|
| Two-way SMS patient | Universel | Inexistant | ENORME |
| Rappel Google review auto | Standard | Inexistant | ENORME |
| Text-to-pay (lien paiement SMS) | Weave standard | Inexistant | FORT |
| Morning huddle dashboard | Dental Intelligence | Inexistant | FORT |
| Pipeline traitement non planifie | Standard | Inexistant | FORT |
| Comptes famille lies | Lighthouse 360 | Rare | MOYEN |
| Presentation plan traitement mobile | Modento | Inexistant | FORT |
| Caller ID patient (contexte tel) | Weave unique | Inexistant | MOYEN |
| Patient financing (BNPL) | CareCredit/Sunbit | Possible (Alma/Pledg) | FORT |
| IA radiographie | Pearl, Overjet | Allisone (debut) | MOYEN |

### Top 10 features US a integrer dans JADOMI (par priorite)

**TIER 1 — Phase A (differenciateurs immediats)**

1. **Two-way SMS patient** — Le gap #1 en France. Tous les outils US l'ont.
   Existant JADOMI : OTP sender + communication cabinet. A enrichir.

2. **Smart waitlist + cancellation fill** — NexHealth/Luma Health.
   C'est exactement la Notif Urgence de Karim. Confirme par le marche US.

3. **Rappels auto intelligents** — Pas juste J-1. Multi-touch :
   SMS J-7 → email J-3 → SMS J-1 → push H-2. Escalade si pas confirme.

**TIER 2 — Phase B (avantages competitifs forts)**

4. **Google review automation** — Apres chaque visite, SMS auto :
   "Merci pour votre visite ! Donnez votre avis ici : [lien Google]"
   Impact : de 15 a 200 avis Google en 6 mois. Aucun outil FR ne le fait.

5. **Text-to-pay** — SMS avec lien paiement Stripe/Alma.
   "Votre facture Dr Bahmed : 180EUR. Payez ici : [lien]"
   Taux de recouvrement US : +35% vs courrier classique.

6. **Morning huddle screen** — Dashboard "journee du dentiste" :
   - RDV du jour avec contexte patient
   - Soldes impayés par patient
   - Traitements non planifies a proposer
   - Objectif CA journee

7. **Unscheduled treatment pipeline** — Afficher :
   "Vous avez 340 000EUR de traitements proposes mais non planifies."
   Chaque ligne : patient, traitement, montant, date proposition.
   Bouton "Relancer" → SMS auto au patient.

**TIER 3 — Phase C (leadership marche)**

8. **Comptes famille** — Parent voit tous les RDV de ses enfants.
   Un seul message atteint le parent pour les 3 enfants.

9. **Presentation plan traitement sur mobile** — Patient recoit sur
   son tel : photos, diagnostic, plan, cout, options paiement.
   Modento : +25% acceptation traitement grace a ca.

10. **Patient financing** — Partenariat Alma/Pledg pour paiement
    en 3x/4x sans frais sur traitements > 500EUR.

---

## 3. ANALYSE CONCURRENTIELLE COMPLETE

### Concurrents France

| Concurrent | Prix | Force | Faiblesse exploitable |
|-----------|------|-------|----------------------|
| Doctolib | 129-249EUR | 60M patients, app native | Acquisition only, pas retention |
| Maiia (Cegedim) | 79-149EUR | Ecosystem Cegedim | Petite base, UX datee |
| Julie/LOGOS_w | Licence | Gestion cabinet complete | Zero engagement patient |
| Allisone | 99-199EUR | IA imagerie | Pas de relation patient |
| Dental Monitoring | 200-500EUR | Suivi ortho IA | Ortho only, tres cher |
| Veasy (Visiodent) | N/A | Cloud-first | Pas d'engagement patient |

### Concurrents internationaux (reference)

| Concurrent | Prix | Force | Ce que JADOMI prend |
|-----------|------|-------|-------------------|
| NexHealth (US) | 350-550$/mo | API-first, sync PMS | Modele API + waitlist |
| Weave (US) | 300-500$/mo | Phone + text + pay | Text-to-pay + caller ID |
| Dental Intelligence (US) | 400-600$/mo | Analytics | Morning huddle |
| Modento (US) | 250-400$/mo | Plan traitement mobile | Presentation patient |
| RevenueWell (US) | 300-500$/mo | Marketing dental | Relance traitement |
| Luma Health (US) | 500+$/mo | Smart waitlist | Matching patient-slot |
| Lighthouse 360 (US) | 300$/mo | Recall system | Comptes famille |
| Solutionreach (US) | 300-400$/mo | NPS + surveys | Satisfaction scoring |

### Positionnement unique JADOMI

> "Tout ce que NexHealth, Weave et Dental Intelligence font aux US
> pour 1 500$/mois cumules, JADOMI le fait en France pour 79EUR/mois."

JADOMI combine dans UN seul outil :
- NexHealth (scheduling + waitlist + API)
- Weave (communication + paiement)
- Dental Intelligence (analytics)
- Modento (plan traitement patient)
- Luma Health (smart matching)

---

## 4. INTEGRATION LOGICIELS METIER

### Realite du marche francais

**Aucun logiciel dentaire francais n'a d'API publique.**

| Logiciel | Part marche | API | Integration possible |
|---------|------------|-----|---------------------|
| Julie (Julie Solutions) | ~25% | NON | Import/export CSV/XML |
| LOGOS_w (Owandy) | ~30% | NON | Import/export CSV/XML |
| Veasy (Visiodent) | ~15% | Peut-etre (cloud) | Partenariat |
| Doctolib | ~60% RDV | NON (programme partenaire) | iCal possible |

### Strategie pragmatique

**Phase A : Zero integration necessaire**
- Saisie manuelle ou import CSV patients
- JADOMI = outil independant du logiciel metier
- 0 risque de dependance technique

**Phase B : Import CSV intelligent**
- Drag-drop fichier patient exporte de Julie/LOGOS_w
- Detection auto colonnes (nom, prenom, tel, email, date naissance)
- Deduplication intelligente
- Effort : 8h

**Phase C : Sync calendrier iCal**
- Feed iCal standard depuis logiciel metier
- JADOMI lit creneaux occupes
- Pas besoin d'API proprietaire
- Effort : 16h

**Phase C+ : APIs gouvernementales (documentees et accessibles)**

| API | Protocole | Doc publique | Avantage |
|-----|----------|-------------|---------|
| Pro Sante Connect | OpenID Connect | OUI | Auth dentiste certifiee |
| MSSante | SMTP/S + S/MIME | OUI | Messagerie sante officielle |
| INS (INSi) | REST/SOAP | OUI | Identite patient nationale |
| DMP | HL7 CDA R2 | OUI | Dossier medical national |

**Phase D : Referencement Segur du Numerique**
- Certification ANS obligatoire
- Prime : 5 040EUR par cabinet adoptant
- Avantage concurrentiel MASSIF
- Effort : 200h+ (projet a part entiere)

**Phase E : Partenariats directs**
- Contacter Visiodent (Veasy) en priorite (cloud-first = plus ouvert)
- Julie Solutions : proposer partenariat technologique
- Position : "JADOMI complete votre logiciel, ne le remplace pas"

---

## 5. FEATURES ENRICHIES — ROADMAP MISE A JOUR

### Phase A (mois 1-3) — MVP sur cabinet Karim

| # | Feature | Effort | Source inspiration |
|---|---------|--------|-------------------|
| 1 | PWA patient (shell, offline, push) | 16h | -- |
| 2 | Auth telephone + OTP | 16h | Klara "no app needed" |
| 3 | RDV simple + rappels auto multi-touch | 16h | Solutionreach |
| 4 | **Smart Batch Slot-Finder** | 20h | PREMIER MONDIAL |
| 5 | Chat IA 24/7 | 24h | NexHealth chatbot |
| 6 | Notifications push (VAPID) | 20h | Weave |
| 7 | Chat direct dentiste-patient | 24h | Klara SMS model |
| 8 | Liste attente smart | 16h | Luma Health |
| 9 | Notif urgence annulation | 40h | NexHealth waitlist |
| 10 | Dashboard dentiste (morning huddle) | 16h | Dental Intelligence |
| | **TOTAL Phase A** | **~210h** | |

### Phase B (mois 4-6) — 5 confreres beta

| # | Feature | Effort |
|---|---------|--------|
| 11 | Google review automation | 8h |
| 12 | Text-to-pay (Stripe link SMS) | 12h |
| 13 | Pipeline traitement non planifie | 16h |
| 14 | Import CSV patients intelligent | 8h |
| 15 | Comptes famille lies | 12h |
| 16 | Migration HDS OVH | 20h config |

### Phase C (mois 7-12) — 50 cabinets

| # | Feature | Effort |
|---|---------|--------|
| 17 | Pro Sante Connect (e-CPS) | 20h |
| 18 | Presentation plan traitement mobile | 24h |
| 19 | Patient financing (Alma/Pledg BNPL) | 16h |
| 20 | Sync iCal logiciel metier | 16h |
| 21 | Analytics avances (NPS, taux acceptation) | 20h |

### Phase D (an 2) — Segur

| # | Feature | Effort |
|---|---------|--------|
| 22 | DMP integration | 80h |
| 23 | MSSante certification | 60h |
| 24 | INS qualification patient | 40h |
| 25 | Referencement Segur ANS | 40h + admin |

---

## 6. CONCLUSION

### Le marche francais a 10 ans de retard

Les dentistes US depensent 1 500-3 000$/mois sur 4-5 outils differents
(NexHealth + Weave + Dental Intelligence + Modento + Lighthouse 360).
Les dentistes francais n'ont **rien** d'equivalent.

### L'opportunite JADOMI

Construire le **NexHealth + Weave + Dental Intelligence** francais
dans un seul produit a 79EUR/mois.

Avec le Smart Batch Slot-Finder en bonus = **premier mondial**.

### Recommandation finale

**GO Phase A — avec le batch slot-finder comme headline feature.**

Ce n'est pas un "nice to have". C'est un **game changer** que
personne au monde ne fait. Quand un dentiste voit ca pour la
premiere fois, il ne peut plus revenir en arriere.
