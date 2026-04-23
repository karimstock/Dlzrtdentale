// =============================================
// JADOMI — Module Mon site internet
// professions/kine.js — Config complete kinesitherapeute
// =============================================

module.exports = {
  id: 'kine',
  label: 'Kinesitherapeute',
  label_plural: 'kinesitherapeutes',
  category: 'sante',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'cabinet de kinesitherapie',
  rgpd_strictness: 'medium',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialisations',
      label: 'Quelles sont vos specialisations ?',
      type: 'multi',
      options: ['sport', 'neurologie', 'respiratoire', 'pediatrie', 'pelvi-perineale', 'therapie manuelle', 'posturologie', 'geriatrie', 'rhumatologie'],
      required: true
    },
    {
      id: 'equipements',
      label: 'De quels equipements disposez-vous ?',
      type: 'multi',
      options: ['balneotherapie', 'ondes de choc', 'pressotherapie', 'electrotherapie', 'plateau physique', 'machines isocinetiques', 'cryotherapie'],
      required: false
    },
    {
      id: 'public_cible',
      label: 'Quel est votre public ?',
      type: 'multi',
      options: ['sportifs amateurs', 'sportifs professionnels', 'seniors', 'enfants', 'femmes enceintes', 'post-operatoire', 'accidentes'],
      required: true
    },
    {
      id: 'approches',
      label: 'Quelles approches therapeutiques utilisez-vous ?',
      type: 'multi',
      options: ['Mezieres', 'McKenzie', 'Mulligan', 'crochetage', 'taping', 'drainage lymphatique', 'therapie manuelle orthopedique'],
      required: false
    },
    {
      id: 'nombre_kines',
      label: 'Combien de kinesitherapeutes exercent dans votre cabinet ?',
      type: 'number',
      required: true
    },
    {
      id: 'domicile',
      label: 'Proposez-vous des soins a domicile ?',
      type: 'single_choice',
      options: ['Oui', 'Non', 'Partiellement'],
      required: false
    },
    {
      id: 'approche_valeurs',
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
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — ou commence la reeducation', required: true, rgpd_sensible: false },
    { id: 'salle_attente', label: 'Salle d\'attente', poetic_label: 'Votre salle d\'attente — moment de pause avant le mouvement', required: false, rgpd_sensible: false },
    { id: 'cabine_individuelle', label: 'Cabine individuelle', poetic_label: 'Cabine individuelle — intimite du soin', required: true, rgpd_sensible: false },
    { id: 'plateau_technique', label: 'Plateau technique', poetic_label: 'Votre plateau — le mouvement remis en marche', required: true, rgpd_sensible: false },
    { id: 'balneotherapie', label: 'Balneotherapie', poetic_label: 'Balneotherapie — la reeducation par l\'eau', required: false, rgpd_sensible: false },
    { id: 'equipement', label: 'Equipement', poetic_label: 'Vos outils — au service du corps', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — mains et savoir-faire au service des patients', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre cabinet en mouvement (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'specialisations',
    'plateau_equipement',
    'equipe',
    'infos_pratiques',
    'contact'
  ],

  vocabulaire: {
    patient: 'patient',
    lieu: 'cabinet',
    acte: 'seance'
  },

  seo_keywords: [
    'kinesitherapeute',
    'cabinet kine',
    'reeducation',
    'kine du sport',
    'physiotherapie',
    'massage therapeutique'
  ],

  competitor_search_query: function(ville) {
    return 'kinesitherapeute ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets de kinesitherapie francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel 'M. [NOM]' ou 'Mme [NOM]'
- Vouvoiement strict
- Ton dynamique, bienveillant, technique, precis
- Jamais d'emojis
- Tu connais deja son cabinet — ne redemande pas ce que tu sais

REGLES DEONTOLOGIQUES (Code de deontologie art. R4321) :
- Pas de publicite tapageuse
- Pas de promesse de guerison
- Peut afficher parcours, specialisations, horaires, prise de RDV en ligne

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE :
- 'nom de domaine' → 'l'adresse de votre cabinet sur internet'
- 'DNS', 'SSL' → ne mentionne JAMAIS
- 'hebergement' → 'JADOMI s'occupe de tout'
- 'URL' → 'adresse'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, salle_attente, cabine_individuelle, plateau_technique, balneotherapie, equipement, equipe, video_presentation.
UNE categorie a la fois. Ordre : accueil → cabine_individuelle → plateau_technique → equipe.

TA MISSION :
Conversation naturelle pour creer le site du cabinet. Tu valorises le mouvement, la reeducation et l'expertise du corps.

ORDRE :
1. Introduction contextuelle
2. Site existant ?
3. Specialisations et approches therapeutiques
4. Equipements et plateau technique
5. Public cible et philosophie
6. Photos
7. Adresse du site
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes fluides avant EXTRACTED_DATA.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "praticien_name": "",
  "ville": "",
  "specialisations": [],
  "equipements": [],
  "public_cible": [],
  "approches": [],
  "nombre_kines": 0,
  "domicile": "",
  "approche_valeurs": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
