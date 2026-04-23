// =============================================
// JADOMI — Module Mon site internet
// professions/architecte.js — Config complete architecte
// =============================================

module.exports = {
  id: 'architecte',
  label: 'Architecte',
  label_plural: 'architectes',
  category: 'liberale',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'agence d\'architecture',
  rgpd_strictness: 'medium',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialisations',
      label: 'Quelles sont vos specialisations ?',
      type: 'multi',
      options: ['residentiel individuel', 'collectif', 'tertiaire', 'equipement public', 'patrimoine', 'rehabilitation', 'HQE', 'eco-construction', 'interieur', 'paysage', 'urbanisme'],
      required: true
    },
    {
      id: 'approche',
      label: 'Comment definiriez-vous votre approche architecturale ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'realisations_phares',
      label: 'Quelles sont vos realisations phares ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'certifications',
      label: 'Disposez-vous de certifications ?',
      type: 'multi',
      options: ['HQE', 'BBC', 'E+C-', 'Passivhaus', 'BREEAM', 'autre'],
      required: false
    },
    {
      id: 'ordre_regional',
      label: 'Quel est votre Ordre regional ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'equipe',
      label: 'Quelle est la composition de votre agence ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'zones_intervention',
      label: 'Quelles sont vos zones d\'intervention ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos clients trouvent votre agence sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse (recommande)',
        'J\'ai deja une adresse pour mon agence',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'accueil_agence', label: 'Agence', poetic_label: 'Votre agence — laboratoire de la forme', required: true, rgpd_sensible: false },
    { id: 'atelier_conception', label: 'Atelier', poetic_label: 'Atelier de conception — penser l\'espace', required: false, rgpd_sensible: false },
    { id: 'atelier_maquettes', label: 'Maquettes', poetic_label: 'Atelier maquettes — de l\'idee au volume', required: false, rgpd_sensible: false },
    { id: 'bibliotheque_materiaux', label: 'Materiautheque', poetic_label: 'Materiautheque — toucher les possibles', required: false, rgpd_sensible: false },
    { id: 'realisations', label: 'Realisations', poetic_label: 'Vos realisations — signatures architecturales', required: true, rgpd_sensible: false },
    { id: 'chantier_en_cours', label: 'Chantier', poetic_label: 'Chantiers — l\'architecture en mouvement', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — creativite collective', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre agence en mouvement (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'philosophie',
    'realisations_portfolio',
    'projets_en_cours',
    'competences_expertises',
    'equipe',
    'actualites',
    'contact'
  ],

  vocabulaire: {
    patient: 'client',
    lieu: 'agence',
    acte: 'projet'
  },

  seo_keywords: [
    'architecte',
    'agence architecture',
    'architecte DPLG',
    'renovation',
    'construction maison',
    'architecte interieur',
    'maitrise d\'oeuvre'
  ],

  competitor_search_query: function(ville) {
    return 'architecte ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour agences d'architecture francaises.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel 'M./Mme [NOM]'
- Vouvoiement strict
- Ton creatif, rigoureux, esthete, engage
- Jamais d'emojis
- Tu connais deja son agence — ne redemande pas ce que tu sais

REGLES DEONTOLOGIQUES (Ordre des architectes) :
- Mentions obligatoires : numero d'inscription Ordre, assurance decennale
- Le portfolio est l'element central du site

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE WEB :
- 'nom de domaine' → 'l'adresse de votre agence sur internet'
- Pas de termes techniques web
Rassure : 'JADOMI s'occupe de tout l'aspect technique.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='realisations' required='true' />
Categories : accueil_agence, atelier_conception, atelier_maquettes, bibliotheque_materiaux, realisations, chantier_en_cours, equipe, video_presentation.
UNE categorie a la fois. Ordre : realisations → accueil_agence → equipe.

TA MISSION :
Conversation naturelle. Tu valorises la vision architecturale, le rapport a l'espace et a la matiere.

ORDRE :
1. Introduction contextuelle
2. Site existant ?
3. Specialisations et approche architecturale
4. Realisations phares
5. Certifications et equipe
6. Photos (les realisations sont LE differentiant — les demander en premier)
7. Adresse du site
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes, ton de critique d'architecture.

<EXTRACTED_DATA>
{
  "agence_name": "",
  "architecte_name": "",
  "ville": "",
  "specialisations": [],
  "approche": "",
  "realisations_phares": "",
  "certifications": [],
  "ordre_regional": "",
  "equipe": "",
  "zones_intervention": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
