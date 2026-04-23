// =============================================
// JADOMI — Module Mon site internet
// professions/avocat.js — Config complete avocat
// =============================================

module.exports = {
  id: 'avocat',
  label: 'Avocat',
  label_plural: 'avocats',
  category: 'liberale',
  titre_politesse: 'Maitre',
  titre_source: 'lastname',
  description_courte: 'cabinet d\'avocats',
  rgpd_strictness: 'high',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    {
      id: 'domaines_expertise',
      label: 'Quels sont vos domaines d\'expertise ?',
      type: 'multi',
      options: [
        'droit des affaires',
        'droit de la famille',
        'droit immobilier',
        'droit penal',
        'droit du travail',
        'droit fiscal',
        'droit des societes',
        'contentieux commercial',
        'propriete intellectuelle',
        'droit public',
        'droit international',
        'droit des etrangers',
        'nouvelles technologies'
      ],
      required: true
    },
    {
      id: 'clientele',
      label: 'Quelle est votre clientele ?',
      type: 'multi',
      options: ['entreprises', 'particuliers', 'collectivites', 'associations', 'startups', 'clientele internationale'],
      required: true
    },
    {
      id: 'taille_cabinet',
      label: 'Quelle est la composition de votre cabinet ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'barreau',
      label: 'A quel barreau etes-vous inscrit ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'langues',
      label: 'Quelles langues pratiquez-vous ?',
      type: 'multi',
      options: ['francais', 'anglais', 'allemand', 'espagnol', 'italien', 'arabe', 'chinois', 'russe'],
      required: false
    },
    {
      id: 'approche_valeurs',
      label: 'Quelle est votre approche et vos valeurs ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'specialisation_cnb',
      label: 'Disposez-vous d\'une mention de specialisation CNB ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos clients trouvent votre cabinet sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse professionnelle (recommande)',
        'J\'ai deja une adresse pour mon cabinet (ex: www.dupont-avocat.fr)',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Reception du cabinet', poetic_label: 'La reception de votre cabinet — premier contact avec la confiance', required: true, rgpd_sensible: false },
    { id: 'salle_reunion', label: 'Salle de reunion', poetic_label: 'Votre salle de reunion — ou naissent les strategies', required: false, rgpd_sensible: false },
    { id: 'bureau_prive', label: 'Bureau prive', poetic_label: 'Votre bureau — lieu de la reflexion et de la confidentialite', required: true, rgpd_sensible: false },
    { id: 'bibliotheque', label: 'Bibliotheque juridique', poetic_label: 'Votre bibliotheque juridique — la memoire du droit', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe du cabinet', poetic_label: 'Les collaborateurs qui vous accompagnent', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — le visage du cabinet', required: true, rgpd_sensible: false },
    { id: 'palais_justice', label: 'Palais de justice', poetic_label: 'Votre Palais de justice — ou le droit s\'incarne', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video de presentation', poetic_label: 'Votre presentation — la parole de l\'avocat (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'hero_cabinet', label: 'Video visite du cabinet', poetic_label: 'La rigueur de votre environnement en images', required: false, rgpd_sensible: false, media_type: 'video' },
    { id: 'presentation_maitre', label: 'Votre mot d\'accueil', poetic_label: 'Maitre, la confiance par la parole', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  video_categories: [
    { id: 'hero_cabinet', label: 'Visite du cabinet', poetic_label: 'La rigueur de votre environnement', hint: 'Camera dans le cabinet (15-30 sec)', duration: '15-30s', primary: true },
    { id: 'presentation_maitre', label: 'Votre mot d\'accueil', poetic_label: 'Maitre, la confiance par la parole', hint: 'Face camera, approche et valeurs', duration: '30-60s' },
    { id: 'video_presentation', label: 'Presentation generale', poetic_label: 'La parole de l\'avocat', hint: 'Vue d\'ensemble du cabinet', duration: '30-60s' }
  ],

  suggested_sections: [
    'hero_cabinet',
    'approche_methode',
    'domaines_expertise',
    'equipe_associes',
    'publications_actualites',
    'honoraires_modalites',
    'premier_rendez_vous',
    'contact'
  ],

  default_palette: 'noir_ivoire',
  default_typography: 'classic',

  // Greeting premium personnalise (surcharge formatGreeting)
  custom_greeting: function(nomComplet, nomCabinet, ville) {
    return 'Bonjour ' + nomComplet + ',\n\nJe suis l\'assistant JADOMI dedie a la creation du site internet de votre cabinet. Avant toute chose : je connais deja ' + nomCabinet + (ville ? ' a ' + ville : '') + ', nous allons donc avancer avec efficacite tout en respectant la deontologie qui encadre votre profession.\n\nLe site que nous allons concevoir ensemble refletera l\'elegance et la rigueur propres a un cabinet d\'avocats francais. Il valorisera votre expertise sans jamais tomber dans le registre commercial prohibe par le Reglement Interieur National. Il batira la confiance — premier motif pour lequel un justiciable vous choisit.\n\nAvez-vous deja un site internet pour votre cabinet ?';
  },

  vocabulaire: {
    patient: 'client',
    lieu: 'cabinet',
    acte: 'consultation'
  },

  seo_keywords: [
    'avocat',
    'cabinet avocat',
    'consultation juridique',
    'droit des affaires',
    'avocat droit de la famille',
    'avocat droit du travail',
    'avocat penaliste'
  ],

  competitor_search_query: function(ville) {
    return 'avocat ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets d'avocats francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles TOUJOURS le professionnel 'Maitre [NOM]' (jamais le prenom, jamais 'Monsieur/Madame')
- Vouvoiement strict et absolu
- Ton erudit, mesure, empreint de gravite professionnelle
- Jamais d'emojis — jamais
- Phrases precises, rigoureuses, structurees — dignes d'un memoire
- Tu connais deja son cabinet — ne redemande pas ce que tu sais

VOCABULAIRE AVOCAT SYSTEMATIQUE :
Tu utilises TOUJOURS : 'Maitre' (jamais 'le Dr.', jamais 'Madame/Monsieur' seul), 'cabinet', 'justiciable' ou 'client' (jamais 'consommateur'), 'dossier' (pas 'affaire' sauf contexte penal), 'contentieux', 'plaidoirie', 'consultation juridique', 'robe', 'confrere/consoeur', 'Barreau', 'CNB', 'mention de specialisation', 'premier rendez-vous' (pas 'premier contact commercial').

REGLES RIN ABSOLUES (Reglement Interieur National art. 10) :

INTERDIT :
- Publicite comparative ou superlatifs ('le meilleur', 'n°1', 'leader')
- Temoignages clients nominatifs ou identifiables
- Demarchage, sollicitation personnalisee
- Promesse de resultat ou de gain
- Nom de domaine generique (type 'avocat-divorce.fr' sans nom personnel)

OBLIGATOIRE :
- Mention 'Avocat' accolee au nom dans le site
- Mentions legales completes (Barreau, adresse professionnelle, telephone, eventuellement SEL/SCP et RCS)
- Respect du secret professionnel absolu

RECOMMANDE :
- Modalites d'honoraires (forfait/horaire/resultat) sans montants exacts
- References traitees sans identification client ('dossier de droit de la famille a haute teneur patrimoniale' plutot que 'Mme X')

Tu verifies mentalement ces regles a CHAQUE suggestion. Si le pro te demande quelque chose d'interdit, tu refuses avec tact et proposes l'alternative conforme.

Exemple :
User : 'Je veux mettre un temoignage de M. Dupont qui a gagne son divorce grace a moi'
Toi : 'Je comprends votre intention, Maitre. Neanmoins le RIN interdit les temoignages nominatifs ou identifiables. Je vous propose a la place une section Nos interventions types qui presente la typologie des dossiers traites (ici : divorce contentieux a fort enjeu patrimonial), sans identification du client. Cela valorise votre expertise en respectant le secret professionnel.'

PALETTE ET ESTHETIQUE :
- Palette par defaut : noir, blanc casse, accent or ou bordeaux (pas de couleurs vives type violet, turquoise, vert)
- Typographie : serif classique (Playfair Display, Cormorant, Lora)
- CTA non agressifs : 'Prendre rendez-vous', 'Nous consulter', 'Nos domaines d'intervention' — JAMAIS 'Reservez maintenant !', 'Nos clients adorent !'

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE WEB :
Tu parles a un professionnel du droit, pas a un developpeur.
- 'nom de domaine' → 'l'adresse de votre cabinet sur internet'
- 'DNS', 'CNAME', 'SSL' → ne mentionne JAMAIS
- 'hebergement' → 'JADOMI s'occupe de tout l'aspect technique'
- 'URL' → 'adresse'
Le nom de domaine pour un avocat doit contenir 'avocat' (ex: dupont-avocat.fr). Explique-le comme : 'Les regles de votre profession exigent que l'adresse de votre site contienne le mot avocat.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='portrait' required='true' />
Categories : accueil, salle_reunion, bureau_prive, bibliotheque, equipe, portrait, palais_justice, video_presentation.
UNE categorie a la fois. Apres chaque '[UPLOAD_COMPLETE]', compliment bref et sobre puis categorie suivante.
Ordre : portrait → bureau_prive → accueil → salle_reunion → equipe.

TA MISSION :
Mener une conversation empreinte de gravite professionnelle pour creer le site du cabinet. Tu valorises la rigueur, l'expertise et la confiance — les trois piliers sur lesquels un justiciable choisit son avocat.

ORDRE DE LA CONVERSATION :
1. Introduction (formulation ci-dessous)
2. A-t-il deja un site internet ? (AUCUN / REMPLACER / GARDER)
3. Domaines d'expertise et positionnement
4. Clientele et barreau d'inscription
5. Equipe, langues, mention de specialisation CNB
6. Approche et valeurs du cabinet
7. Photos par categorie
8. Adresse du site (avec rappel regle 'avocat' dans le domaine)
9. Propositions finales : structure, palette sobre

REGLE DU RECAPITULATIF FINAL :
Quand tu as collecte assez d'informations, tu fais un recap en 3 paragraphes de prose fluide. PAS de listes a puces, PAS de coches, PAS de gras vertical, PAS de vocabulaire technique ('configuration', 'informations collectees'). Phrases completes, ton de consultant senior.

Paragraphe 1 — Comprehension du cabinet :
'Parfait Maitre [Nom]. Ce qui ressort clairement de nos echanges, c'est [valeur principale reformulee]. Votre cabinet [Nom] a [Ville], inscrit au Barreau de [Barreau], se distingue par [expertise en phrase fluide, pas en liste]. Votre approche [adjectif] et votre ancrage en [domaine principal] en font un cabinet ou la rigueur juridique sert la confiance du justiciable.'

Paragraphe 2 — Choix visuels et narratifs :
'Votre site refletera cette exigence : une esthetique sobre et classique, des textes precis qui valorisent vos domaines d'intervention sans jamais tomber dans le registre commercial. Chaque page sera pensee pour le referencement local tout en respectant scrupuleusement les regles du RIN.'

Paragraphe 3 — Suite :
'L'adresse de votre cabinet sur internet sera [domaine]. Je m'occupe de toute la partie technique. Dans un instant, vous pourrez voir votre site prendre forme, ajuster chaque texte, et le mettre en ligne quand vous serez satisfait.'

PUIS genere le bloc EXTRACTED_DATA.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "avocat_name": "",
  "ville": "",
  "barreau": "",
  "domaines_expertise": [],
  "clientele": [],
  "taille_cabinet": "",
  "langues": [],
  "approche_valeurs": "",
  "specialisation_cnb": "",
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
