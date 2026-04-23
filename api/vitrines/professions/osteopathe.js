// =============================================
// JADOMI — Module Mon site internet
// professions/osteopathe.js — Config complete osteopathe
// =============================================

module.exports = {
  id: 'osteopathe',
  label: 'Osteopathe',
  label_plural: 'osteopathes',
  category: 'sante',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'cabinet d\'osteopathie',
  rgpd_strictness: 'medium',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'approches',
      label: 'Quelles approches pratiquez-vous ?',
      type: 'multi',
      options: ['structurelle', 'cranienne', 'viscerale', 'pediatrique', 'sport', 'fasciatherapie', 'perinatale'],
      required: true
    },
    {
      id: 'public_cible',
      label: 'Quel est votre public ?',
      type: 'multi',
      options: ['nourrissons', 'enfants', 'adultes', 'femmes enceintes', 'sportifs', 'seniors'],
      required: true
    },
    {
      id: 'formation',
      label: 'Quelle est votre formation et votre ecole ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'certifications',
      label: 'Disposez-vous de certifications complementaires ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'nombre_osteopathes',
      label: 'Combien d\'osteopathes exercent dans votre cabinet ?',
      type: 'number',
      required: true
    },
    {
      id: 'domicile',
      label: 'Proposez-vous des consultations a domicile ?',
      type: 'single_choice',
      options: ['Oui', 'Non', 'Partiellement'],
      required: false
    },
    {
      id: 'philosophie',
      label: 'Quelle est votre philosophie de soin ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos patients trouvent votre cabinet sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse professionnelle (recommande)',
        'J\'ai deja une adresse pour mon cabinet',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — au seuil de l\'equilibre', required: true, rgpd_sensible: false },
    { id: 'salle_consultation', label: 'Salle de consultation', poetic_label: 'Votre salle de consultation — ecoute du corps', required: true, rgpd_sensible: false },
    { id: 'table_osteopathie', label: 'Table d\'osteopathie', poetic_label: 'Votre table — lieu du toucher therapeutique', required: false, rgpd_sensible: false },
    { id: 'equipement', label: 'Espace d\'examen', poetic_label: 'Espace d\'examen — precision du geste', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — votre presence rassurante', required: true, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — mains expertes, ecoute attentive', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre univers en mouvement (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'approches_osteopathiques',
    'pour_qui',
    'parcours_formation',
    'cabinet',
    'infos_pratiques',
    'contact'
  ],

  vocabulaire: {
    patient: 'patient',
    lieu: 'cabinet',
    acte: 'seance'
  },

  seo_keywords: [
    'osteopathe',
    'cabinet osteopathie',
    'osteopathe du sport',
    'osteopathie pediatrique',
    'manipulation douce',
    'osteopathe nourrisson'
  ],

  competitor_search_query: function(ville) {
    return 'osteopathe ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets d'osteopathie francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel 'M. [NOM]' ou 'Mme [NOM]' (JAMAIS 'Dr.' sauf si 'Docteur en osteopathie DO' mentionne en entier)
- Vouvoiement strict
- Ton holistique, pose, humain, ecoute
- Jamais d'emojis
- Tu connais deja son cabinet — ne redemande pas ce que tu sais

REGLES DEONTOLOGIQUES :
- Pas de titre 'Docteur' sauf mention complete 'Docteur en osteopathie DO'
- Pas de revendications therapeutiques abusives
- Pas de pretention a guerir — l'osteopathie accompagne, equilibre, soulage

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE :
- 'nom de domaine' → 'l'adresse de votre cabinet sur internet'
- 'DNS', 'SSL' → ne mentionne JAMAIS
- 'URL' → 'adresse'
Rassure : 'JADOMI s'occupe de tout le cote technique.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, salle_consultation, table_osteopathie, equipement, portrait, equipe, video_presentation.
UNE categorie a la fois. Ordre : portrait → salle_consultation → accueil.

TA MISSION :
Conversation naturelle pour creer le site. Tu valorises l'ecoute du corps, l'equilibre et la precision du geste.

ORDRE :
1. Introduction contextuelle
2. Site existant ?
3. Approches et formation
4. Public cible et certifications
5. Philosophie de soin
6. Photos
7. Adresse du site
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes fluides.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "praticien_name": "",
  "ville": "",
  "approches": [],
  "public_cible": [],
  "formation": "",
  "certifications": "",
  "nombre_osteopathes": 0,
  "domicile": "",
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
