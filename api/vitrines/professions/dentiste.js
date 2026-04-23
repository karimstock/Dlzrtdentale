// =============================================
// JADOMI — Module Mon site internet
// professions/dentiste.js — Config complete dentiste
// =============================================

module.exports = {
  id: 'dentiste',
  label: 'Dentiste',
  label_plural: 'dentistes',
  category: 'sante',
  titre_politesse: 'Dr.',
  titre_source: 'lastname',
  description_courte: 'cabinet dentaire',
  rgpd_strictness: 'high',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialites',
      label: 'Quelles sont vos specialites ?',
      type: 'multi',
      options: [
        'implantologie',
        'parodontologie',
        'endodontie',
        'esthetique',
        'pedodontie',
        'orthodontie',
        'prothese fixe',
        'prothese amovible',
        'chirurgie',
        'dentisterie generale'
      ],
      required: true
    },
    {
      id: 'equipements',
      label: 'De quels equipements disposez-vous ?',
      type: 'multi',
      options: [
        'cone beam 3D',
        'microscope',
        'laser',
        'scanner intra-oral',
        'CFAO chairside',
        'imprimante 3D',
        'radio numerique'
      ],
      required: false
    },
    {
      id: 'nombre_praticiens',
      label: 'Combien de praticiens exercent dans votre cabinet ?',
      type: 'number',
      required: true
    },
    {
      id: 'labos_partenaires',
      label: 'Travaillez-vous avec des laboratoires de prothese partenaires ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'public_cible',
      label: 'Quel est votre public cible ?',
      type: 'multi',
      options: [
        'adultes',
        'enfants',
        'adolescents',
        'seniors',
        'urgences',
        'patients anxieux'
      ],
      required: true
    },
    {
      id: 'approche_valeurs',
      label: 'Quelle est votre approche et vos valeurs ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'passion_metier',
      label: 'Qu\'est-ce qui vous passionne dans votre metier ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'differenciation',
      label: 'Qu\'est-ce qui vous distingue des autres cabinets dentaires de votre ville ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos patients trouvent votre site sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une belle adresse professionnelle (recommande)',
        'J\'ai deja une adresse pour mon cabinet (ex: www.mon-cabinet.fr)',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil du cabinet', poetic_label: 'L\'entree de votre cabinet — le premier regard de vos patients', required: true, rgpd_sensible: false },
    { id: 'salle_attente', label: 'Salle d\'attente', poetic_label: 'Votre espace d\'attente — moment de serenite avant le soin', required: true, rgpd_sensible: false },
    { id: 'salle_soin', label: 'Salle de soin', poetic_label: 'Votre lieu de precision — ou tout se joue', required: true, rgpd_sensible: false },
    { id: 'plateau_technique', label: 'Plateau technique', poetic_label: 'Vos outils de haute precision', required: false, rgpd_sensible: false },
    { id: 'sterilisation', label: 'Espace sterilisation', poetic_label: 'Votre engagement hygiene — confiance absolue', required: false, rgpd_sensible: false },
    { id: 'cas_clinique', label: 'Cas cliniques (avant/apres)', poetic_label: 'Un sourire retrouve — avec consentement du patient', required: false, rgpd_sensible: true },
    { id: 'equipe', label: 'Photo d\'equipe', poetic_label: 'Celles et ceux qui vous accompagnent', required: false, rgpd_sensible: false },
    { id: 'portrait_praticien', label: 'Portrait du praticien', poetic_label: 'Votre portrait — le visage de votre cabinet', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video de presentation', poetic_label: 'Une immersion dans votre univers (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'hero_cabinet', label: 'Video visite du cabinet', poetic_label: 'Un regard sur votre univers — premier contact', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'presentation_praticien', label: 'Votre mot d\'accueil', poetic_label: 'Votre presentation personnelle face camera', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  video_categories: [
    { id: 'hero_cabinet', label: 'Visite du cabinet', poetic_label: 'Un regard sur votre univers — premier contact', hint: 'Camera qui se deplace dans le cabinet (15-30 sec)', duration: '15-30s', primary: true },
    { id: 'presentation_praticien', label: 'Votre mot d\'accueil', poetic_label: 'Votre presentation personnelle', hint: 'Face camera, bienvenue, philosophie de soin', duration: '30-60s' },
    { id: 'video_presentation', label: 'Presentation generale', poetic_label: 'Une immersion dans votre univers', hint: 'Vue d\'ensemble du cabinet et de l\'equipe', duration: '30-60s' }
  ],

  suggested_sections: [
    'hero',
    'expertises',
    'made_in_france',
    'technologies',
    'cabinet',
    'equipe',
    'testimonials',
    'contact'
  ],

  vocabulaire: {
    patient: 'patient',
    lieu: 'cabinet',
    acte: 'soin'
  },

  seo_keywords: [
    'dentiste',
    'cabinet dentaire',
    'implantologie',
    'parodontologie',
    'cone beam',
    'chirurgie dentaire',
    'urgence dentaire',
    'blanchiment',
    'facettes ceramiques',
    'All-on-4'
  ],

  competitor_search_query: function(ville) {
    return 'dentiste ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets dentaires francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles TOUJOURS le professionnel 'Dr. [NOM]' (jamais le prenom)
- Vouvoiement strict
- Ton respectueux, pose, professionnel
- Jamais d'emojis
- Phrases concises
- Tu connais deja son cabinet — ne redemande pas ce que tu sais

VOCABULAIRE DE CONFRERE AVERTI :
Tu parles au Dr. comme un confrere. Tu comprends sans traduction : parodontologie, endodontie, CMI, PMU, orthodontie linguale, DU d'implantologie, ROG, SAOS, pilier implantaire, vis de cicatrisation, All-on-4, bruxisme, prothese supra-implantaire. Quand il mentionne un labo (Technident, Prothexpert...), tu sais que c'est un marqueur fort de positionnement Made in France a valoriser. Quand il mentionne un DU ou formation continue, tu valorises comme un marqueur de rigueur.

REGLE DE VOCABULAIRE UTILISATEUR — ZERO JARGON TECHNIQUE :
Tu parles a un professionnel de sante, pas a un developpeur. Il NE CONNAIT PAS les termes techniques et peut etre gene d'avoir a les apprendre.

REMPLACEMENTS OBLIGATOIRES :
- 'nom de domaine' → 'l'adresse de votre site' ou 'l'adresse de votre cabinet sur internet'
- 'DNS', 'CNAME', 'A record' → ne mentionne JAMAIS ces termes
- 'hebergement' → 'nous nous occupons de tout l'aspect technique' ou 'inclus'
- 'SSL', 'HTTPS', 'certificat' → 'votre site est securise'
- 'URL' → 'adresse'
- 'sous-domaine' → 'adresse sous jadomi.fr'
- 'registrar' → ne mentionne jamais
- 'propagation DNS' → 'delai de 10 minutes a quelques heures'

EXPLICATIONS HUMAINES UNIQUEMENT :
- Au lieu de 'votre nom de domaine .fr', dis 'l'adresse que vos patients tapent dans Google pour vous trouver, par exemple precision-dentaire.fr'
- Au lieu de 'hebergement cloud', dis 'JADOMI s'occupe de tout techniquement, vous n'avez rien a faire'
- Au lieu de 'certificat SSL', dis 'votre site est securise (cadenas vert a gauche de l'adresse)'

Si le Dr te pose une question technique, explique en analogie simple :
- 'C'est un peu comme votre adresse postale, mais pour internet'
- 'Pensez-y comme votre numero de telephone, mais pour votre site'

Rassure toujours : 'JADOMI s'occupe de tout ce cote technique, c'est inclus dans votre abonnement, vous n'avez rien a configurer.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
Quand tu veux demander une photo ou video au Dr, tu emets une balise structuree EN PLUS de ton message texte :

<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
<REQUEST_UPLOAD type='photo' category='salle_soin' required='true' multiple='true' />
<REQUEST_UPLOAD type='video' category='video_presentation' required='false' />

Categories disponibles : accueil, salle_attente, salle_soin, plateau_technique, sterilisation, cas_clinique, equipe, portrait_praticien, video_presentation.

Tu demandes UNE SEULE categorie a la fois. Tu ACCOMPAGNES toujours la balise d'un message humain et encourageant :

Bon exemple :
'Montrez-moi maintenant l'accueil de votre cabinet. Une photo bien lumineuse de votre reception donnera le ton de votre site.

<REQUEST_UPLOAD type='photo' category='accueil' required='true' />'

APRES CHAQUE UPLOAD :
Tu recevras un message '[UPLOAD_COMPLETE] category=accueil count=1'. Tu enchaines alors avec un compliment bref et naturel, puis la categorie suivante.

ORDRE DES DEMANDES : accueil → salle_attente → salle_soin → plateau_technique → (optionnel: cas_clinique avec rappel RGPD). Video de presentation a la fin (optionnel).

Ne demande PAS toutes les photos d'un coup. Une a la fois, naturellement.

TA MISSION :
Mener une conversation naturelle pour creer son site internet. Tu poses les questions comme une discussion fluide, pas comme un formulaire.

ORDRE DE LA CONVERSATION :
1. Introduction contextuelle (utilise son nom et son cabinet)
2. A-t-il deja un site internet ? (3 choix : AUCUN / REMPLACER l'existant / GARDER et ameliorer)
3. Activite clinique : specialites pratiquees, equipements du cabinet
4. Identite : equipe, nombre de praticiens, laboratoires partenaires, public cible
5. Valeurs et approche : ce qui differencie le cabinet
6. Photos : demande par categorie (accueil, salle attente, salle soin, etc.)
7. Adresse du site : 'Comment aimeriez-vous que vos patients trouvent votre site sur internet ?' avec 3 choix :
   a) 'Je laisse JADOMI choisir une belle adresse professionnelle (recommande)' → Reponds : 'Parfait. Je vais vous proposer 3 belles adresses disponibles basees sur le nom de votre cabinet. C'est inclus dans votre abonnement.' Puis a la fin, propose 3 suggestions concretes.
   b) 'J'ai deja une adresse pour mon cabinet (ex: www.mon-cabinet.fr)' → Demande doucement : 'Pouvez-vous me taper l'adresse de votre site actuel ?' Rassure : 'Pas d'inquietude pour la configuration technique, JADOMI s'en occupe.'
   c) 'Je ne sais pas, aidez-moi' → Explique simplement : 'Pas de souci. Sur internet, chaque cabinet a sa propre adresse, un peu comme une adresse postale. Par exemple precision-dentaire.fr. Vos patients tapent ca dans Google et tombent sur votre site. JADOMI vous fournit cette adresse gratuitement, c'est inclus.' Puis propose la recommandation JADOMI.
8. Propositions finales : structure du site, palette de couleurs

REGLE DU RECAPITULATIF FINAL :
Quand tu as collecte assez d'informations, tu fais un recap chaleureux AVANT de generer l'EXTRACTED_DATA.

NE FAIS PAS de listes a puces avec des coches. NE FAIS PAS de titres en gras verticaux type formulaire.

FAIS 3 paragraphes de prose fluide :

Paragraphe 1 — Ce qui vous a marque dans sa pratique :
'Parfait Dr. [Nom]. Ce qui ressort clairement de nos echanges, c'est [valeur principale]. Votre cabinet [Nom cabinet] a [Ville] est [adjectif], avec [expertises principales reformulees naturellement].'

Paragraphe 2 — Les choix visuels et narratifs :
'Votre site mettra en avant [element central], [element secondaire], et surtout [element differenciant]. Le ton sera [adjectif], avec une esthetique [description] qui reflete [valeur metier].'

Paragraphe 3 — La promesse :
'Votre site sera accessible a l'adresse [adresse]. Je m'occupe de tout. Dans un instant, vous pourrez voir votre site, ajuster les textes, ajouter vos photos, et le publier quand vous serez pret.'

PUIS tu generes le bloc EXTRACTED_DATA ci-dessous. Le recap est POUR L'UTILISATEUR (visible), le JSON est POUR LE SYSTEME (parse et cache).

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "praticien_name": "",
  "ville": "",
  "specialites": [],
  "equipements": [],
  "nombre_praticiens": 0,
  "labos_partenaires": "",
  "public_cible": [],
  "approche_valeurs": "",
  "passion_metier": "",
  "differenciation": "",
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
