// =============================================
// JADOMI — Module Mon site internet
// professions/coiffeur.js — Config complete coiffeur
// =============================================

module.exports = {
  id: 'coiffeur',
  label: 'Coiffeur',
  label_plural: 'coiffeurs',
  category: 'beaute',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'salon de coiffure',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialisations',
      label: 'Quelles sont vos specialites ?',
      type: 'multi',
      options: ['coloriste', 'visagiste', 'coupe femme', 'coupe homme', 'coupe enfant', 'extensions', 'balayage', 'chignon mariee', 'afro', 'barbier', 'coloration vegetale', 'keratine', 'permanente'],
      required: true
    },
    {
      id: 'marques',
      label: 'Quelles marques utilisez-vous ?',
      type: 'multi',
      options: ['L\'Oreal Professionnel', 'Kerastase', 'Schwarzkopf', 'Wella', 'Olaplex', 'Davines', 'Aveda', 'bio/naturel', 'autre'],
      required: false
    },
    {
      id: 'positionnement',
      label: 'Comment definiriez-vous votre salon ?',
      type: 'single_choice',
      options: ['salon familial', 'haut de gamme', 'urbain tendance', 'ecologique bio', 'specialise afro', 'barbershop'],
      required: true
    },
    {
      id: 'equipe',
      label: 'Combien de coiffeurs composent votre equipe ?',
      type: 'number',
      required: true
    },
    {
      id: 'services_additionnels',
      label: 'Proposez-vous des services complementaires ?',
      type: 'multi',
      options: ['cafe/boissons', 'massage cuir chevelu', 'soins capillaires', 'conseil en image', 'vente de produits'],
      required: false
    },
    {
      id: 'reservation_en_ligne',
      label: 'Souhaitez-vous integrer la reservation en ligne ?',
      type: 'single_choice',
      options: ['Oui', 'Non', 'Deja en place (Planity, Treatwell, etc.)'],
      required: true
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos clients trouvent votre salon sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse (recommande)',
        'J\'ai deja une adresse pour mon salon',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'vitrine_salon', label: 'Vitrine du salon', poetic_label: 'Votre vitrine — l\'invitation a entrer', required: true, rgpd_sensible: false },
    { id: 'espace_coiffage', label: 'Espace coiffage', poetic_label: 'Espace coiffage — scene de la metamorphose', required: true, rgpd_sensible: false },
    { id: 'bac_a_shampoing', label: 'Bac a shampoing', poetic_label: 'Bac a shampoing — premier moment de detente', required: false, rgpd_sensible: false },
    { id: 'bar_a_couleurs', label: 'Bar a couleurs', poetic_label: 'Bar a couleurs — palette des possibles', required: false, rgpd_sensible: false },
    { id: 'espace_attente', label: 'Espace attente', poetic_label: 'Espace d\'attente — pause bien-etre', required: false, rgpd_sensible: false },
    { id: 'realisations_avant_apres', label: 'Avant / Apres', poetic_label: 'Avant / Apres — vos transformations signatures', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — artistes de vos cheveux', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — votre signature', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre salon en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'prestations_tarifs',
    'realisations_galerie',
    'equipe',
    'avis_clients',
    'reservation_en_ligne',
    'contact'
  ],

  vocabulaire: {
    patient: 'client',
    lieu: 'salon',
    acte: 'prestation'
  },

  seo_keywords: [
    'coiffeur',
    'salon coiffure',
    'coiffeur visagiste',
    'coloriste',
    'balayage',
    'coiffeur homme',
    'barbier'
  ],

  competitor_search_query: function(ville) {
    return 'coiffeur ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour salons de coiffure francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel par son prenom ou 'M./Mme [NOM]' selon le contexte
- Vouvoiement au debut, tutoiement si le professionnel passe au tu
- Ton creatif, chaleureux, inspirant, tendance
- Emojis moderes acceptes pour ce metier
- Tu connais deja son salon — ne redemande pas ce que tu sais

REGLE DE VOCABULAIRE — PEU DE JARGON TECHNIQUE :
- 'nom de domaine' → 'l'adresse de votre salon sur internet'
- Pas de termes techniques web
Rassure : 'JADOMI s'occupe de tout le cote technique, c'est inclus.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='vitrine_salon' required='true' />
Categories : vitrine_salon, espace_coiffage, bac_a_shampoing, bar_a_couleurs, espace_attente, realisations_avant_apres, equipe, portrait, video_presentation.
UNE categorie a la fois. Ordre : vitrine → espace_coiffage → portrait → realisations.

TA MISSION :
Conversation naturelle pour creer le site du salon. Tu valorises la creativite, le style et l'experience client.

ORDRE :
1. Introduction chaleureuse
2. Site existant ?
3. Specialites et positionnement
4. Marques et services
5. Equipe et ambiance
6. Photos (avant/apres = differentiant majeur pour le SEO)
7. Reservation en ligne
8. Adresse du site
9. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes de prose fluide, ton inspirant et creatif.

<EXTRACTED_DATA>
{
  "salon_name": "",
  "gerant_name": "",
  "ville": "",
  "specialisations": [],
  "marques": [],
  "positionnement": "",
  "equipe_nombre": 0,
  "services_additionnels": [],
  "reservation_en_ligne": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
