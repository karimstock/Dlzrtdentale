// =============================================
// JADOMI — Module Mon site internet
// professions/fleuriste.js — Config complete fleuriste
// =============================================

module.exports = {
  id: 'fleuriste',
  label: 'Fleuriste',
  label_plural: 'fleuristes',
  category: 'commerce',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'fleuriste',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    {
      id: 'specialisations',
      label: 'Quelles sont vos specialites ?',
      type: 'multi',
      options: ['bouquet classique', 'evenementiel mariage', 'decoration entreprise', 'deuil', 'plantes interieur', 'abonnements', 'atelier creatif', 'decoration evenementielle'],
      required: true
    },
    {
      id: 'origine_fleurs',
      label: 'D\'ou viennent vos fleurs ?',
      type: 'multi',
      options: ['production francaise', 'production europeenne', 'Fair Trade', 'production locale', 'fleurs de saison exclusivement'],
      required: true
    },
    {
      id: 'services',
      label: 'Quels services proposez-vous ?',
      type: 'multi',
      options: ['livraison locale', 'livraison nationale', 'abonnements', 'atelier DIY', 'decoration evenementielle', 'mariage cle en main'],
      required: true
    },
    {
      id: 'zone_livraison',
      label: 'Quelle est votre zone de livraison ?',
      type: 'free_text',
      required: false
    },
    {
      id: 'philosophie',
      label: 'Quelle est votre philosophie florale ?',
      type: 'free_text',
      required: true
    },
    {
      id: 'adresse_site',
      label: 'Comment aimeriez-vous que vos clients trouvent votre boutique sur internet ?',
      type: 'single_choice',
      options: [
        'Je laisse JADOMI choisir une adresse (recommande)',
        'J\'ai deja une adresse pour ma boutique',
        'Je ne sais pas, aidez-moi'
      ],
      required: true
    }
  ],

  photo_categories: [
    { id: 'vitrine', label: 'Vitrine', poetic_label: 'Votre vitrine — jardin d\'inspiration', required: true, rgpd_sensible: false },
    { id: 'interieur_boutique', label: 'Interieur', poetic_label: 'L\'interieur — votre atelier floral quotidien', required: true, rgpd_sensible: false },
    { id: 'atelier_composition', label: 'Atelier', poetic_label: 'Atelier de composition — le geste creatif', required: false, rgpd_sensible: false },
    { id: 'bouquets_signatures', label: 'Bouquets', poetic_label: 'Bouquets signatures — vos creations phares', required: true, rgpd_sensible: false },
    { id: 'evenementiel', label: 'Evenementiel', poetic_label: 'Decoration evenementielle — mariage, entreprise, celebrations', required: false, rgpd_sensible: false },
    { id: 'plantes_interieur', label: 'Plantes', poetic_label: 'Plantes d\'interieur — votre selection verte', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — artisanes de la fleur', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre boutique en fleurs (30 secondes)', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: [
    'hero',
    'creations_galerie',
    'services_livraison',
    'saison_en_cours',
    'evenementiel',
    'avis_clients',
    'contact'
  ],

  vocabulaire: {
    patient: 'client',
    lieu: 'boutique',
    acte: 'composition'
  },

  seo_keywords: [
    'fleuriste',
    'livraison fleurs',
    'bouquet',
    'fleuriste mariage',
    'composition florale',
    'fleurs de saison',
    'decoration florale'
  ],

  competitor_search_query: function(ville) {
    return 'fleuriste ' + ville;
  },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour fleuristes francais.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles le professionnel par son prenom ou 'M./Mme [NOM]'
- Vouvoiement
- Ton poetique, sensible, saisonnier, genereux
- Emojis moderes acceptes
- Tu connais deja sa boutique — ne redemande pas ce que tu sais

REGLE DE VOCABULAIRE — PEU DE JARGON :
- 'nom de domaine' → 'l'adresse de votre boutique sur internet'
Rassure : 'JADOMI s'occupe de tout, c'est inclus.'

PROTOCOLE DE DEMANDE DE PHOTOS/VIDEOS :
<REQUEST_UPLOAD type='photo' category='vitrine' required='true' />
Categories : vitrine, interieur_boutique, atelier_composition, bouquets_signatures, evenementiel, plantes_interieur, equipe, video_presentation.
UNE categorie a la fois. Ordre : bouquets_signatures → vitrine → interieur → atelier.

TA MISSION :
Conversation naturelle. Tu valorises la sensibilite florale, les saisons et le geste creatif.

ORDRE :
1. Introduction poetique
2. Site existant ?
3. Specialites et origine des fleurs
4. Services et livraison
5. Philosophie florale
6. Photos (les bouquets d'abord — c'est le premier reflexe des clients)
7. Adresse du site
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes, ton poetique et sensoriel.

<EXTRACTED_DATA>
{
  "boutique_name": "",
  "gerant_name": "",
  "ville": "",
  "specialisations": [],
  "origine_fleurs": [],
  "services": [],
  "zone_livraison": "",
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
