---
name: fhir-healthcare
description: FHIR R4 + santé française (INS, RPPS, CCAM, DMP) — interopérabilité données cliniques JADOMI
---

# FHIR Healthcare — Interopérabilité JADOMI

## FHIR R4 — Ressources dentaires
| Ressource | Usage JADOMI |
|-----------|-------------|
| Patient | Identité, INS, coordonnées |
| Practitioner | Dentiste, RPPS, spécialité |
| Appointment | RDV agenda |
| Schedule | Créneaux disponibles |
| Slot | Créneau individuel libre/occupé |
| Encounter | Séance de soins (multi-actes) |
| Procedure | Acte réalisé (code CCAM) |
| Condition | Diagnostic (carie, parodontite) |
| Observation | Mesure clinique (sondage paro) |
| DocumentReference | CR consultation, radio, devis |

## Base URL FHIR
```
POST   /fhir/Patient
GET    /fhir/Patient/:id
GET    /fhir/Patient?name=Dupont
PUT    /fhir/Patient/:id
DELETE /fhir/Patient/:id
```

## Patient FHIR avec INS
```json
{
  "resourceType": "Patient",
  "identifier": [
    { "system": "urn:oid:1.2.250.1.213.1.4.8", "value": "1850173000000" },
    { "system": "https://jadomi.fr/patient", "value": "pat-12345" }
  ],
  "name": [{ "family": "Dupont", "given": ["Marie"], "use": "official" }],
  "gender": "female",
  "birthDate": "1985-01-15",
  "telecom": [
    { "system": "phone", "value": "+33612345678", "use": "mobile" },
    { "system": "email", "value": "marie@email.fr" }
  ],
  "address": [{ "line": ["12 rue de la Paix"], "city": "Roubaix", "postalCode": "59100", "country": "FR" }]
}
```

## Appointment (RDV dentaire)
```json
{
  "resourceType": "Appointment",
  "status": "booked",
  "serviceCategory": [{ "coding": [{ "system": "http://jadomi.fr/service-category", "code": "dental" }] }],
  "serviceType": [{ "coding": [{ "system": "http://jadomi.fr/acte", "code": "detartrage", "display": "Detartrage" }] }],
  "start": "2026-05-20T10:00:00+02:00",
  "end": "2026-05-20T10:30:00+02:00",
  "minutesDuration": 30,
  "participant": [
    { "actor": { "reference": "Patient/pat-12345" }, "status": "accepted" },
    { "actor": { "reference": "Practitioner/pra-67890" }, "status": "accepted" }
  ]
}
```

## Codes CCAM dentaires (NE PAS simplifier)
```js
// Les codes CCAM sont COMPLEXES — ne jamais inventer
// Source : ameli.fr/medecin/exercice-liberal/facturation/codage-actes-dentaires
const CCAM_EXEMPLES = {
  'HBBD001': 'Détartrage et polissage des dents',
  'HBMD042': 'Restauration 1 face dent permanente',
  'HBMD050': 'Restauration 2 faces dent permanente',
  'HBGD002': 'Avulsion dent permanente',
  'HBED015': 'Traitement endodontique monoradiculée',
  'HBLD038': 'Pose couronne dentaire',
  'LBLD010': 'Pose implant intra-osseux'
};
// IMPORTANT : ne JAMAIS prétendre comprendre la cotation CCAM
// Toujours renvoyer vers le praticien pour la cotation
```

## INS — Identifiant National de Santé
```js
// L'INS est le numéro de sécurité sociale qualifié
// Obtention : via INSi (téléservice CNAM)
// Format : 13 chiffres (NIR) + clé
async function verifierINS(nir) {
  // Appel téléservice INSi
  // Retourne : nom, prénom, date naissance, sexe
  // OBLIGATOIRE pour DMP et espace de santé
}
```

## RPPS — Identification praticien
```js
// RPPS = Répertoire Partagé des Professionnels de Santé
// 11 chiffres, commence par 1 (médecins/dentistes) ou 6 (infirmiers)
// Source : annuaire-sante.ameli.fr
const praticien = {
  rpps: '10000000000',
  nom: 'Martin',
  prenom: 'Pierre',
  specialite: 'Chirurgien-dentiste',
  adresse_cabinet: '12 rue de la Santé, 59100 Roubaix'
};
```

## DMP — Dossier Médical Partagé
```js
// Le DMP est hébergé par l'Assurance Maladie
// Accès via Pro Santé Connect (carte CPS ou e-CPS)
// Documents dentaires à alimenter :
// - CR consultation, plan de traitement, devis
// - Radios (panoramique, rétro-alvéolaire)
// - Comptes rendus implantaires
// Pas d'API publique directe — passer par les connecteurs logiciels
```

## Espace de santé (Mon Espace Santé)
```js
// Depuis 2022, chaque patient a un espace de santé
// Le dentiste peut y déposer des documents via DMP
// Le patient voit ses documents sur monespacesante.fr
// Messagerie sécurisée entre pros et patients
```

## FHIR Server Node.js (si JADOMI devient serveur FHIR)
```js
// Packages : fhir.js, fhir-kit-client
const { Client } = require('fhir-kit-client');
const fhirClient = new Client({ baseUrl: 'https://jadomi.fr/fhir' });

// Recherche patients
const results = await fhirClient.search({
  resourceType: 'Patient',
  searchParams: { name: 'Dupont', _count: 10 }
});
```

## MCP Server FHIR
- `@themomentum/fhir-mcp-server` — accès HIPAA-compliant
- Lit/écrit des ressources FHIR depuis Claude
