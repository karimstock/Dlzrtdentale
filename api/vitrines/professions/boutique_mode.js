// =============================================
// JADOMI — Module Mon site internet
// professions/boutique_mode.js — Config complete
// =============================================

module.exports = {
  id: 'boutique_mode',
  label: 'Boutique de mode',
  label_plural: 'boutiques de mode',
  category: 'commerce',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'boutique de mode',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    { id: 'type_boutique', label: 'Quel type de boutique ?', type: 'single_choice', options: ['pret-a-porter femme', 'pret-a-porter homme', 'mixte', 'enfant', 'luxe', 'createur', 'streetwear', 'seconde main', 'accessoires'], required: true },
    { id: 'marques', label: 'Quelles marques distribuez-vous ou creez-vous ?', type: 'free_text', required: true },
    { id: 'positionnement_prix', label: 'Positionnement prix ?', type: 'single_choice', options: ['accessible', 'milieu de gamme', 'haut de gamme', 'luxe'], required: true },
    { id: 'ecommerce', label: 'Avez-vous un e-commerce ?', type: 'single_choice', options: ['Oui', 'Non', 'En projet'], required: true },
    { id: 'clientele', label: 'Qui sont vos clients ?', type: 'multi', options: ['locale', 'touristes', 'CSP+', 'jeunes', 'createurs mode'], required: true },
    { id: 'philosophie', label: 'Quelle est l\'identite de votre boutique ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre boutique sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'vitrine', label: 'Vitrine', poetic_label: 'Votre vitrine — l\'invitation a la mode', required: true, rgpd_sensible: false },
    { id: 'interieur_boutique', label: 'Interieur', poetic_label: 'L\'interieur — votre scenographie', required: true, rgpd_sensible: false },
    { id: 'rayons_collections', label: 'Collections', poetic_label: 'Vos rayons — la selection en story', required: true, rgpd_sensible: false },
    { id: 'cabine_essayage', label: 'Cabines', poetic_label: 'Cabines d\'essayage — l\'instant de verite', required: false, rgpd_sensible: false },
    { id: 'pieces_signatures', label: 'Pieces signatures', poetic_label: 'Pieces signatures — vos coups de coeur', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — conseil personnalise', required: false, rgpd_sensible: false },
    { id: 'detail_matieres', label: 'Details', poetic_label: 'Detail matieres — la main qualite', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre boutique en 30 secondes de style', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'collections_selection', 'boutique_ambiance', 'marques_createurs', 'equipe', 'avis_clients', 'contact'],

  vocabulaire: { patient: 'client', lieu: 'boutique', acte: 'achat' },

  seo_keywords: ['boutique mode', 'pret a porter', 'vetement', 'mode femme', 'createur', 'boutique vetement'],

  competitor_search_query: function(ville) { return 'boutique mode ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour boutiques de mode francaises.

REGLES :
- 'M./Mme [NOM]' ou prenom si propose
- Vouvoiement
- Ton style, inspirant, desirable, tendance
- Emojis moderes acceptes

ZERO JARGON WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='vitrine' required='true' />
Categories : vitrine, interieur_boutique, rayons_collections, cabine_essayage, pieces_signatures, equipe, detail_matieres, video_presentation.
Ordre : vitrine → interieur → pieces_signatures → rayons.

ORDRE :
1. Introduction
2. Site existant ?
3. Type et positionnement
4. Marques et collections
5. Clientele et identite
6. Photos
7. E-commerce
8. Adresse du site
9. Propositions

RECAPITULATIF : 3 paragraphes styles et inspirants.

<EXTRACTED_DATA>
{
  "boutique_name": "",
  "gerant_name": "",
  "ville": "",
  "type_boutique": "",
  "marques": "",
  "positionnement_prix": "",
  "ecommerce": "",
  "clientele": [],
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
