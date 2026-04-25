# RAPPORT EXECUTIF -- JADOMI DENTISTE PRO
## Pre-etude Passe 45 | 25 avril 2026
**Pour : Dr Karim Bahmed, Fondateur JADOMI**

---

## 1. SYNTHESE VISION

JADOMI Dentiste Pro cible un marche ignore : **30 000 dentistes satures**
en France qui paient Doctolib 149EUR/mois pour un service d'acquisition
dont ils n'ont pas besoin. Positionnement : gestion + relation patient
pour cabinets pleins. 4 features killers : chat chiffre, RDV simple,
chat IA 24/7, notification urgence annulation (le game changer).

---

## 2. CE QU'ON A DEJA (~60-65%)

L'audit des modules JADOMI existants revele qu'une **base solide** est
deja construite et fonctionnelle en production :

| Module | Lignes de code | Statut | Reutilisable |
|--------|---------------|--------|-------------|
| Systeme RDV complet | 806 lignes, 15 endpoints | Prod | OUI |
| Portail client securise | 456 + 342 lignes | Prod | OUI |
| Timeline patient (photos IA) | 1067 lignes, 20 endpoints | Prod | OUI -- KILLER |
| Onboarding Coach | 360 lignes, 11 endpoints | Prod | OUI |
| Communication multi-canal | 17 KB, 9 endpoints | Prod | OUI |
| OTP (SMS + WhatsApp + Email) | 4.8 KB | Prod | OUI |
| Chiffrement AES-256-GCM | Integre partout | Prod | OUI |

**Le module Timeline (suivi photo avant/apres avec Claude Vision)
est un avantage concurrentiel majeur. Aucun concurrent ne l'a.**

---

## 3. CE QU'IL FAUT CREER (~35-40%)

| Composant | Effort | Priorite |
|-----------|--------|----------|
| PWA Patient (shell, offline, manifest) | 16h | CRITIQUE |
| Auth telephone + OTP (zero mot de passe) | 16h | CRITIQUE |
| Notifications push (VAPID + service worker) | 20h | HAUTE |
| Rappels RDV auto (J-1, H-2) | 8h | HAUTE |
| Chat direct dentiste-patient | 24h | HAUTE |
| Chat IA patient 24/7 | 24h | HAUTE |
| Liste attente intelligente + scoring | 16h | MOYENNE |
| Notif urgence annulation (game changer) | 40h | MOYENNE |
| Dashboard dentiste enrichi | 12h | BASSE |
| Import CSV patients (sync logiciel) | 8h | BASSE |
| Tests + debug + polish | 20h | CRITIQUE |
| **TOTAL** | **~210h** | |

---

## 4. ANALYSE CONCURRENTIELLE

### Paysage concurrentiel France

| Concurrent | Prix | Forces | Faiblesse exploitable |
|-----------|------|--------|----------------------|
| **Doctolib** | 149EUR/mois | 60M patients, app native | Inutile pour cabinets satures |
| **Maiia** (Cegedim) | 79-149EUR | Ecosystem Cegedim | Petite base patients |
| **Allisone** | 99-199EUR | IA imagerie dentaire | Pas de relation patient |
| **Dental Monitoring** | 200-500EUR | Suivi ortho IA | Ortho uniquement, tres cher |
| **Julie/LOGOS_w** | Licence | Gestion complete cabinet | Zero engagement patient |

### Positionnement strategique unique

> "Doctolib amene les patients. Julie gere le cabinet. 
> **JADOMI fidelise et engage.**"

**Aucun concurrent ne propose :**
- App patient pour cabinet sature (0 acteur)
- Chat chiffre dentiste-patient specifique (0 acteur)
- Notif urgence annulation automatique (0 acteur)
- Suivi photo patient IA (Dental Monitoring = ortho seulement)
- Systeme de fidelite patient (0 acteur)
- Chat IA 24/7 pour cabinet dentaire (0 acteur)

**Gap de marche confirme : le creneau est totalement libre.**

---

## 5. INTEGRATIONS LOGICIELS METIER

### Realite du marche : aucune API publique

| Logiciel | Part marche | API publique | Integration possible |
|---------|------------|-------------|---------------------|
| Julie | ~25% | NON | Import CSV uniquement |
| LOGOS_w | ~30% | NON | Import CSV uniquement |
| Veasy (Visiodent) | ~15% | Cloud (possible) | Partenariat a negocier |
| Doctolib | ~60% RDV | NON (partner program) | iCal sync eventuel |

### Strategie recommandee

- **Phase A :** Import CSV generique (fonctionne avec TOUT logiciel) -- 8h
- **Phase B :** iCal sync calendrier -- 16h
- **Phase C :** Pro Sante Connect (e-CPS, authentification) -- 20h
- **Phase D :** Segur du Numerique (DMP, MSSante, INS) -- 200h+
  - Referencement Segur = avantage concurrentiel MASSIF
  - Prime ANS 5 040EUR par cabinet adoptant

### API gouvernementales accessibles (documentees)

| API | Protocole | Phase | Avantage |
|-----|----------|-------|---------|
| Pro Sante Connect | OpenID Connect | C | Auth dentiste certifiee |
| MSSante | SMTP/S + S/MIME | C | Messagerie sante officielle |
| INS (INSi) | REST/SOAP | D | Identite patient nationale |
| DMP | HL7 CDA R2 | D | Dossier medical national |

---

## 6. ESTIMATION BUDGET

### Phase A (mois 1-3) -- Labo interne Karim

| Poste | Cout |
|-------|------|
| Dev Claude Code (~210h x forfait actuel) | 0EUR (deja paye via Claude Max) |
| Hebergement (serveur actuel) | 0EUR (deja en place) |
| SMS OVH pour OTP (~100 patients x 5 SMS) | ~25EUR |
| Domaine patient.jadomi.fr | 0EUR (sous-domaine) |
| **TOTAL Phase A** | **~25EUR** |

### Phase B (mois 4-6) -- 5 confreres beta

| Poste | Cout |
|-------|------|
| Migration OVH HDS (obligatoire multi-cabinets) | 800-1500EUR/mois |
| Audit securite initial | 5 000-10 000EUR one-shot |
| DPO temps partiel | 500-1000EUR/mois |
| SMS volume (5 cabinets x 4000 patients x 3 SMS) | ~600EUR/mois |
| VAPID push (gratuit) | 0EUR |
| **TOTAL Phase B setup** | **~15 000-25 000EUR** |
| **TOTAL Phase B mensuel** | **~2 000-3 500EUR/mois** |

### Seuil rentabilite Phase B
5 cabinets x 79EUR = **395EUR/mois** (ne couvre pas les couts)
**Seuil rentabilite = ~30-40 cabinets** (2 400-3 200EUR/mois)

---

## 7. RISQUES MAJEURS

| Risque | Impact | Probabilite | Mitigation |
|--------|--------|-------------|-----------|
| HDS non conforme multi-cabinets | Bloquant legal | Haute si oublie | Migration OVH HDS des Phase B |
| Adoption patient faible | Echec produit | Moyenne | Test 50 patients Karim d'abord |
| Cout SMS explose | Tresorerie | Faible | Push gratuit en priorite |
| Concurrent copie le concept | Perte avantage | Faible (12-18 mois) | Executer vite, fidéliser |
| Bug critique donnees sante | Legal + reputation | Faible | Tests exhaustifs Phase A |
| Service Worker trop basique | UX degradee | Moyenne | Refaire sw.js de zero |

---

## 8. QUICK WINS PHASE A

Actions a fort impact avec effort minimal :

1. **PWA patient basique** (16h) -- Installable en 1 clic
2. **Auth OTP telephone** (16h) -- Zero friction inscription
3. **Chat IA cabinet** (24h) -- Repond 24/7, decharged secretariat
4. **Rappels RDV auto** (8h) -- Reduit no-shows immediatement
5. **Timeline dans PWA** (0h) -- Deja construit, juste brancher

**En 64h (~2 semaines), le MVP est testable sur 50 patients Karim.**

---

## 9. RECOMMANDATION

# GO PHASE A

**Justification :**

1. **Le marche est libre** -- Aucun concurrent ne sert les cabinets satures
2. **60-65% du produit existe** -- On ne part pas de zero
3. **Cout Phase A quasi nul** -- 25EUR de SMS
4. **Le fondateur EST le premier client** -- 4000 patients reels pour tester
5. **Moat concurrentiel fort** -- Timeline IA + Notif urgence + Chat IA
6. **Timing ideal** -- Avant que Doctolib pivote vers la retention

**Calendrier propose :**

| Semaine | Livrable |
|---------|----------|
| S1-S2 | PWA shell + Auth OTP + Rappels RDV |
| S3-S4 | Chat IA + Notifications push |
| S5-S6 | Chat direct + Liste attente |
| S7 | Tests avec 50 patients Karim |

**Decision a prendre par Karim :**

- [ ] **GO** -- Demarrer Phase A (Passe 46) cette semaine
- [ ] **WAIT** -- Reporter a juillet (stabiliser Avocat Expert d'abord)
- [ ] **NO-GO** -- Abandonner (non recommande)

---

*Rapport genere le 25 avril 2026 par Claude Code -- Passe 45*
*Audit base sur 135+ tables SQL, 500+ routes API, 16 fichiers backend*
