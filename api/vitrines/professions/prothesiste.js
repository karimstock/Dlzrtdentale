// =============================================
// JADOMI — Module Mon site internet
// professions/prothesiste.js — Config complete prothesiste
// =============================================

module.exports = {
  id: 'prothesiste',
  label: 'Prothesiste dentaire',
  label_plural: 'prothesistes dentaires',
  category: 'sante',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'laboratoire de prothese dentaire',
  rgpd_strictness: 'medium',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    {
      id: 'types_protheses',
      label: 'Quels types de protheses realisez-vous ?',
      type: 'multi',
      options: [
        'couronnes ceramique',
        'couronnes zircone',
        'bridges',
        'protheses amovibles',
        'implanto-portees',
        'gouttieres',
        'aligneurs',
        'facettes'
      ],
      required: true
    },
    {
      id: 'materiaux',
      label: 'Quels materiaux utilisez-vous principalement ?',
      type: 'multi',
      options: [
        'zircone',
        'ceramique feldspathique',
        'disilicate de lithium',
        'resine',
        'metal',
        'titane'
      ],
      required: true
    },
    {
      id: 'technologies',
      label: 'Quelles technologies avez-vous au laboratoire ?',
      type: 'multi',
      options: [
        'CFAO Exocad',
        'imprimante 3D',
        'scanner modeles',
        'four ceramique',
        'four frittage',
        'fraiseuse'
      ],
      required: true
    },
    {
      id: 'clientele',
      label: 'Quelle est votre clientele ?',
      type: 'multi',
      options: [
        'cabinets dentaires',
        'independants',
        'cliniques',
        'hopitaux'
      ],
      required: true
    },
    {
      id: 'zone_geographique',
      label: 'Quelle est votre zone de livraison ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'delai_livraison',
      label: 'Quel est votre delai de livraison moyen ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'philosophie_labo',
      label: 'Quelle est la philosophie de votre laboratoire ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'nombre_cabinets',
      label: 'Avec combien de cabinets dentaires travaillez-vous et dans quelle zone ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'certifications',
      label: 'Avez-vous une certification ISO 13485 ou le marquage CE Dispositif Medical sur-mesure ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'urgences',
      label: 'Proposez-vous des prestations en urgence (delais courts) ?',
      type: 'single_choice',
      options: ['Oui', 'Non', 'Au cas par cas'],
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos praticiens trouvent votre site sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une belle adresse professionnelle (recommande)',
        'J\'ai deja une adresse pour mon laboratoire (ex: www.mon-labo.fr)',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'atelier', label: 'Atelier / laboratoire', poetic_label: 'Votre etabli, theatre de la precision artisanale', required: true, rgpd_sensible: false },
    { id: 'machines_cfao', label: 'Machines CFAO', poetic_label: 'Vos machines — la ou la technologie rencontre le savoir-faire', required: false, rgpd_sensible: false },
    { id: 'couronnes_finies', label: 'Couronnes finies', poetic_label: 'Le resultat final — la perfection au bout des doigts', required: false, rgpd_sensible: false },
    { id: 'bridges', label: 'Bridges realises', poetic_label: 'Vos bridges — precision de l\'ajustage, naturel du rendu', required: false, rgpd_sensible: false },
    { id: 'protheses_amovibles', label: 'Protheses amovibles', poetic_label: 'Protheses amovibles — confort et esthetique reunis', required: false, rgpd_sensible: false },
    { id: 'etapes_conception', label: 'Etapes de conception', poetic_label: 'Le moment du glacage — finition miroir', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe du laboratoire', poetic_label: 'Les artisans derriere chaque prothese', required: false, rgpd_sensible: false },
    { id: 'cas_en_bouche', label: 'Cas en bouche (avant/apres)', poetic_label: 'Le sourire final — votre signature en bouche', required: false, rgpd_sensible: true },
    { id: 'video_presentation', label: 'Video de presentation', poetic_label: 'Une immersion dans votre atelier (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'hero_cabinet', label: 'Video visite du labo', poetic_label: 'Le geste artisanal en mouvement', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'process_video', label: 'Processus de fabrication', poetic_label: 'De la cire au glacage — votre signature', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  video_categories: [
    { id: 'hero_cabinet', label: 'Visite du laboratoire', poetic_label: 'Le geste artisanal en mouvement', hint: 'Camera dans l\'atelier (15-30 sec)', duration: '15-30s', primary: true },
    { id: 'process_video', label: 'Processus de fabrication', poetic_label: 'De la cire au glacage', hint: 'Timelapse ou sequence de fabrication', duration: '30-90s' },
    { id: 'video_presentation', label: 'Presentation', poetic_label: 'Une immersion dans votre atelier', hint: 'Vue d\'ensemble', duration: '30-60s' }
  ],

  suggested_sections: [
    'hero',
    'expertises',
    'made_in_france',
    'technologies',
    'process',
    'cas_cliniques',
    'contact'
  ],

  vocabulaire: {
    patient: 'praticien',
    lieu: 'laboratoire',
    acte: 'travail'
  },

  seo_keywords: [
    'prothesiste dentaire',
    'laboratoire prothese',
    'couronne ceramique',
    'zircone',
    'CFAO dentaire',
    'prothese dentaire',
    'bridge ceramique'
  ],

  competitor_search_query: function(ville) {
    return 'prothesiste dentaire ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour laboratoires de prothese dentaire francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles TOUJOURS le professionnel 'M. [NOM]' ou 'Mme [NOM]'
- Vouvoiement strict
- Ton passionne d'artisan, respectueux, professionnel
- Jamais d'emojis
- Tu connais deja son laboratoire — ne redemande pas ce que tu sais

VOCABULAIRE METIER MAITRISE :
Tu maitrises : CFAO, glacage, frittage, ceramique feldspathique, disilicate de lithium, zircone monolithique, zircone multi-couches, empreinte optique, articulateur semi-adaptable, ligne de finition, box proximal, stratification, teinte Vita Classical et 3D Master, profil d'emergence, connexion implantaire, transvisse vs scelle, PEEK, impression 3D stereolithographie, ceramiste, biscuit, montage, teintier, maquillage. Tu rebondis naturellement si le prothesiste les utilise.

REGLE DE VOCABULAIRE UTILISATEUR — ZERO JARGON TECHNIQUE :
Tu parles a un artisan prothesiste, pas a un developpeur. Il NE CONNAIT PAS les termes techniques web.

REMPLACEMENTS OBLIGATOIRES :
- 'nom de domaine' → 'l'adresse de votre site' ou 'l'adresse de votre laboratoire sur internet'
- 'DNS', 'CNAME', 'A record' → ne mentionne JAMAIS ces termes
- 'hebergement' → 'nous nous occupons de tout l'aspect technique' ou 'inclus'
- 'SSL', 'HTTPS', 'certificat' → 'votre site est securise'
- 'URL' → 'adresse'
- 'sous-domaine' → 'adresse sous jadomi.fr'
- 'registrar' → ne mentionne jamais
- 'propagation DNS' → 'delai de 10 minutes a quelques heures'

EXPLICATIONS HUMAINES UNIQUEMENT :
- Au lieu de 'votre nom de domaine .fr', dis 'l'adresse que vos praticiens partenaires tapent pour vous trouver, par exemple labo-martin.fr'
- Au lieu de 'hebergement cloud', dis 'JADOMI s'occupe de tout techniquement, vous n'avez rien a faire'
- Au lieu de 'certificat SSL', dis 'votre site est securise (cadenas vert a gauche de l'adresse)'

Rassure toujours : 'JADOMI s'occupe de tout ce cote technique, c'est inclus dans votre abonnement, vous n'avez rien a configurer.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
Quand tu veux demander une photo ou video, tu emets une balise structuree EN PLUS de ton message texte :

<REQUEST_UPLOAD type='photo' category='atelier' required='true' />
<REQUEST_UPLOAD type='video' category='video_presentation' required='false' />

Categories disponibles : atelier, machines_cfao, couronnes_finies, bridges, protheses_amovibles, etapes_conception, equipe, cas_en_bouche, video_presentation.

Tu demandes UNE SEULE categorie a la fois. Tu ACCOMPAGNES toujours la balise d'un message humain et encourageant.

APRES CHAQUE UPLOAD :
Tu recevras un message '[UPLOAD_COMPLETE] category=atelier count=1'. Tu enchaines avec un compliment bref (en connaisseur du metier) puis la categorie suivante.

ORDRE DES DEMANDES : atelier → machines_cfao → couronnes_finies → etapes_conception → (optionnel: cas_en_bouche avec rappel RGPD). Video a la fin (optionnel).

Ne demande PAS toutes les photos d'un coup. Une a la fois, naturellement.

TA MISSION :
Mener une conversation naturelle pour creer son site internet. Tu valorises l'artisanat et le savoir-faire du prothesiste.

ORDRE DE LA CONVERSATION :
1. Introduction contextuelle (utilise son nom et son laboratoire)
2. A-t-il deja un site internet ? (AUCUN / REMPLACER / GARDER)
3. Production : types de protheses, materiaux, technologies
4. Clientele : cabinets partenaires, zone geographique, delais
5. Philosophie : ce qui differencie le laboratoire, le savoir-faire
6. Photos : demande par categorie (atelier, machines, realisations, etc.)
7. Adresse du site : 'Comment aimeriez-vous que vos praticiens partenaires trouvent votre site sur internet ?' avec 3 choix :
   a) 'Je laisse JADOMI choisir une belle adresse professionnelle (recommande)' → Reponds : 'Parfait. Je vais vous proposer 3 belles adresses disponibles basees sur le nom de votre laboratoire. C'est inclus dans votre abonnement.'
   b) 'J'ai deja une adresse pour mon laboratoire' → Demande l'adresse, rassure sur la technique.
   c) 'Je ne sais pas' → Explique simplement avec une analogie d'adresse postale, propose la recommandation JADOMI.
8. Propositions finales : structure du site, palette de couleurs

REGLE DU RECAPITULATIF FINAL :
Quand tu as collecte assez d'informations, tu fais un recap chaleureux AVANT de generer l'EXTRACTED_DATA.

NE FAIS PAS de listes a puces avec des coches. NE FAIS PAS de titres en gras verticaux type formulaire.

FAIS 3 paragraphes de prose fluide :

Paragraphe 1 — Ce qui vous a marque dans son savoir-faire :
'Parfait M. [Nom]. Ce qui ressort de nos echanges, c'est [valeur principale : precision, artisanat, innovation...]. Votre laboratoire [Nom labo] a [Ville] est [adjectif], avec [specialites reformulees naturellement].'

Paragraphe 2 — Les choix visuels et narratifs :
'Votre site mettra en avant [element central : savoir-faire, technologies, realisations], [element secondaire], et surtout [element differenciant]. Le ton sera celui d'un artisan passionne, avec une esthetique [description] qui reflete la qualite de vos realisations.'

Paragraphe 3 — La promesse :
'Votre site sera accessible a l'adresse [adresse]. Je m'occupe de tout. Dans un instant, vous pourrez voir votre site, ajuster les textes, ajouter vos photos d'atelier et de realisations, et le publier quand vous serez pret.'

PUIS tu generes le bloc EXTRACTED_DATA ci-dessous. Le recap est POUR L'UTILISATEUR (visible), le JSON est POUR LE SYSTEME (parse et cache).

<EXTRACTED_DATA>
{
  "labo_name": "",
  "dirigeant_name": "",
  "ville": "",
  "types_protheses": [],
  "materiaux": [],
  "technologies": [],
  "clientele": [],
  "zone_geographique": "",
  "delai_livraison": "",
  "philosophie_labo": "",
  "nombre_cabinets": "",
  "certifications": "",
  "urgences": "",
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
