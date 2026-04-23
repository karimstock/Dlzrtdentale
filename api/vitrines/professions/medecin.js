// =============================================
// JADOMI — Module Mon site internet
// professions/medecin.js — Config complete medecin
// =============================================

module.exports = {
  id: 'medecin',
  label: 'Medecin',
  label_plural: 'medecins',
  category: 'sante',
  titre_politesse: 'Dr.',
  titre_source: 'lastname',
  description_courte: 'cabinet medical',
  rgpd_strictness: 'high',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialite',
      label: 'Quelle est votre specialite ?',
      type: 'single_choice',
      options: ['generaliste', 'cardiologie', 'dermatologie', 'pediatrie', 'gynecologie', 'ophtalmologie', 'psychiatrie', 'endocrinologie', 'rhumatologie', 'ORL', 'autre'],
      required: true
    },
    {
      id: 'conventionnement',
      label: 'Quel est votre conventionnement ?',
      type: 'single_choice',
      options: ['Secteur 1', 'Secteur 2', 'Non conventionne'],
      required: true
    },
    {
      id: 'actes_pratiques',
      label: 'Quels actes pratiquez-vous en dehors des consultations classiques ?',
      type: 'multi',
      options: ['petite chirurgie', 'frottis', 'ECG', 'echographie', 'telemedecine', 'consultations a domicile', 'vaccination', 'suivi grossesse'],
      required: false
    },
    {
      id: 'public_cible',
      label: 'Quel est votre public cible ?',
      type: 'multi',
      options: ['tout public', 'familles', 'seniors', 'pediatrie', 'adolescents'],
      required: true
    },
    {
      id: 'langues',
      label: 'Quelles langues parlez-vous ?',
      type: 'multi',
      options: ['francais', 'anglais', 'allemand', 'espagnol', 'italien', 'arabe', 'autre'],
      required: false
    },
    {
      id: 'approche_philosophie',
      label: 'Quelle est votre approche et philosophie de pratique ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'tiers_payant',
      label: 'Pratiquez-vous le tiers payant ?',
      type: 'single_choice',
      options: ['Oui', 'Non', 'Partiel'],
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos patients trouvent votre cabinet sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse professionnelle (recommande)',
        'J\'ai deja une adresse (ex: www.dr-dupont.fr)',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'facade', label: 'Facade du cabinet', poetic_label: 'La facade de votre cabinet — premier repere pour vos patients', required: false, rgpd_sensible: false },
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — le sourire qui rassure', required: true, rgpd_sensible: false },
    { id: 'salle_attente', label: 'Salle d\'attente', poetic_label: 'Votre salle d\'attente — lieu d\'apaisement avant la consultation', required: true, rgpd_sensible: false },
    { id: 'cabinet_consultation', label: 'Cabinet de consultation', poetic_label: 'Votre cabinet — l\'espace de l\'ecoute', required: true, rgpd_sensible: false },
    { id: 'salle_examen', label: 'Salle d\'examen', poetic_label: 'Votre salle d\'examen — precision et respect de l\'intimite', required: false, rgpd_sensible: false },
    { id: 'equipement_medical', label: 'Equipement medical', poetic_label: 'Votre plateau technique — l\'outil au service du soin', required: false, rgpd_sensible: false },
    { id: 'portrait_praticien', label: 'Portrait du praticien', poetic_label: 'Votre portrait — visage de la relation de confiance', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video de presentation', poetic_label: 'Votre presentation — 30 secondes de confiance', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'specialites',
    'approche_humaine',
    'parcours_formation',
    'cabinet',
    'infos_pratiques',
    'contact'
  ],

  vocabulaire: {
    patient: 'patient',
    lieu: 'cabinet',
    acte: 'consultation'
  },

  seo_keywords: [
    'medecin',
    'cabinet medical',
    'medecin generaliste',
    'consultation medicale',
    'medecin conventionne',
    'docteur'
  ],

  competitor_search_query: function(ville) {
    return 'medecin ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets medicaux francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles TOUJOURS le professionnel 'Dr. [NOM]' (jamais le prenom)
- Vouvoiement strict
- Ton rassurant, competent, empathique, mesure
- Jamais d'emojis
- Phrases concises et precises
- Tu connais deja son cabinet — ne redemande pas ce que tu sais

REGLES DEONTOLOGIQUES (Code de la sante publique art. R. 4127-19) :
- Pas de publicite comparative
- Pas de revendication de resultats
- Pas de prix affiches pour les actes conventionnes
- Peut afficher : coordonnees, specialites, parcours de formation, informations scientifiques validees
- Vocabulaire : 'patient' et non 'client', 'consultation' et non 'rendez-vous'

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE :
Tu parles a un professionnel de sante, pas a un developpeur.
- 'nom de domaine' → 'l'adresse de votre cabinet sur internet'
- 'DNS', 'SSL', 'hebergement' → ne mentionne JAMAIS
- 'URL' → 'adresse'
Rassure : 'JADOMI s'occupe de tout l'aspect technique, c'est inclus.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : facade, accueil, salle_attente, cabinet_consultation, salle_examen, equipement_medical, portrait_praticien, video_presentation.
UNE categorie a la fois. Ordre : portrait → accueil → salle_attente → cabinet_consultation.

TA MISSION :
Conversation naturelle pour creer le site du cabinet. Tu valorises la competence, l'ecoute et la confiance.

ORDRE :
1. Introduction contextuelle
2. Site existant ? (AUCUN / REMPLACER / GARDER)
3. Specialite et conventionnement
4. Actes pratiques, public cible
5. Approche humaine et philosophie
6. Photos par categorie
7. Adresse du site (3 choix humains)
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes de prose fluide avant EXTRACTED_DATA.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "praticien_name": "",
  "ville": "",
  "specialite": "",
  "conventionnement": "",
  "actes_pratiques": [],
  "public_cible": [],
  "langues": [],
  "approche_philosophie": "",
  "tiers_payant": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "adresse_site_existante": "",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
