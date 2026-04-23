// =============================================
// JADOMI — Module Mon site internet
// professions/restaurant.js — Config complete restaurant
// =============================================

module.exports = {
  id: 'restaurant',
  label: 'Restaurant',
  label_plural: 'restaurants',
  category: 'restauration',
  titre_politesse: 'Chef',
  titre_source: 'lastname',
  description_courte: 'restaurant',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'type_cuisine',
      label: 'Quel type de cuisine proposez-vous ?',
      type: 'single_choice',
      options: ['gastronomique', 'bistronomique', 'traditionnelle francaise', 'regionale', 'du monde', 'bistrot', 'brasserie', 'vegetarien', 'etoile'],
      required: true
    },
    {
      id: 'chef_parcours',
      label: 'Quel est le parcours du chef ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'produits',
      label: 'Quelle est votre approche produits ?',
      type: 'multi',
      options: ['locaux', 'de saison', 'bio', 'circuit court', 'peche responsable', 'potager propre', 'producteurs identifies'],
      required: true
    },
    {
      id: 'carte',
      label: 'Comment est structuree votre carte ?',
      type: 'multi',
      options: ['menu degustation', 'carte fixe', 'formule dejeuner', 'a la carte', 'menu du jour', 'brunch'],
      required: true
    },
    {
      id: 'ambiance',
      label: 'Quelle ambiance definit votre restaurant ?',
      type: 'single_choice',
      options: ['intime', 'familial', 'chic', 'decontracte', 'romantique', 'festif', 'contemporain'],
      required: true
    },
    {
      id: 'couverts',
      label: 'Combien de couverts pouvez-vous accueillir ?',
      type: 'number',
      required: true
    },
    {
      id: 'services',
      label: 'Quels services proposez-vous ?',
      type: 'multi',
      options: ['terrasse', 'privatisation', 'evenements', 'traiteur', 'a emporter', 'livraison', 'cave a vins'],
      required: false
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos convives trouvent votre restaurant sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse (recommande)',
        'J\'ai deja une adresse pour mon restaurant',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'facade', label: 'Facade', poetic_label: 'Votre facade — invitation de rue', required: true, rgpd_sensible: false },
    { id: 'salle_principale', label: 'Salle', poetic_label: 'Votre salle — ecrin de l\'experience', required: true, rgpd_sensible: false },
    { id: 'cuisine_ouverte', label: 'Cuisine', poetic_label: 'Cuisine — le geste du chef', required: false, rgpd_sensible: false },
    { id: 'plats_signatures', label: 'Plats signatures', poetic_label: 'Vos plats signatures — votre carte en images', required: true, rgpd_sensible: false },
    { id: 'ingredients_produits', label: 'Produits', poetic_label: 'Vos produits — exigence des origines', required: false, rgpd_sensible: false },
    { id: 'cave_boissons', label: 'Cave', poetic_label: 'Votre cave — accords choisis', required: false, rgpd_sensible: false },
    { id: 'equipe_brigade', label: 'Brigade', poetic_label: 'Votre brigade — talents en cuisine et salle', required: false, rgpd_sensible: false },
    { id: 'portrait_chef', label: 'Portrait du chef', poetic_label: 'Portrait du chef — l\'esprit des lieux', required: true, rgpd_sensible: false },
    { id: 'terrasse_exterieur', label: 'Terrasse', poetic_label: 'Terrasse — saisons et convivialite', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'L\'experience en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'chef_philosophie',
    'carte_menu',
    'salle_ambiance',
    'produits_origines',
    'reservation_en_ligne',
    'avis_clients',
    'contact'
  ],

  vocabulaire: {
    patient: 'convive',
    lieu: 'restaurant',
    acte: 'repas'
  },

  seo_keywords: [
    'restaurant',
    'restaurant gastronomique',
    'bistrot',
    'brasserie',
    'menu du jour',
    'cuisine de saison',
    'reservation restaurant'
  ],

  competitor_search_query: function(ville) {
    return 'restaurant ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour restaurants francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel 'Chef [NOM]' ou 'M./Mme [NOM]' selon le contexte
- Vouvoiement strict
- Ton gourmand, passionne, fier, sensoriel
- Emojis moderes acceptes pour ce metier
- Tu connais deja son restaurant — ne redemande pas ce que tu sais

REGLE DE VOCABULAIRE — PEU DE JARGON TECHNIQUE :
- 'nom de domaine' → 'l'adresse de votre restaurant sur internet'
- Pas de termes techniques web
Rassure : 'JADOMI s'occupe de tout, c'est inclus.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='facade' required='true' />
Categories : facade, salle_principale, cuisine_ouverte, plats_signatures, ingredients_produits, cave_boissons, equipe_brigade, portrait_chef, terrasse_exterieur, video_presentation.
UNE categorie a la fois. Ordre : plats_signatures → salle_principale → facade → portrait_chef.

TA MISSION :
Conversation naturelle pour creer le site du restaurant. Tu valorises la cuisine, le produit, l'ambiance et l'experience.

ORDRE :
1. Introduction (utilise le nom du restaurant et du chef)
2. Site existant ?
3. Type de cuisine et parcours du chef
4. Produits et approvisionnement
5. Carte et ambiance
6. Services (terrasse, privatisation, etc.)
7. Photos (les plats d'abord — c'est le premier reflexe des clients sur Google)
8. Adresse du site
9. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes de prose gourmande et sensorielle.

<EXTRACTED_DATA>
{
  "restaurant_name": "",
  "chef_name": "",
  "ville": "",
  "type_cuisine": "",
  "chef_parcours": "",
  "produits": [],
  "carte": [],
  "ambiance": "",
  "couverts": 0,
  "services": [],
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "site_existant_url": "",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
