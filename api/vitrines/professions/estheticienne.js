// =============================================
// JADOMI — Module Mon site internet
// professions/estheticienne.js — Config complete
// =============================================

module.exports = {
  id: 'estheticienne',
  label: 'Estheticienne',
  label_plural: 'estheticiennes',
  category: 'beaute',
  titre_politesse: 'Mme',
  titre_source: 'lastname',
  description_courte: 'institut de beaute',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    { id: 'soins', label: 'Quels soins proposez-vous ?', type: 'multi', options: ['soins visage', 'soins corps', 'epilation cire', 'epilation lumiere pulsee', 'onglerie', 'extensions cils', 'maquillage permanent', 'spa', 'hammam', 'massage', 'drainage', 'amincissement'], required: true },
    { id: 'marques', label: 'Quelles marques professionnelles utilisez-vous ?', type: 'multi', options: ['Thalgo', 'Guinot', 'Maria Galland', 'Payot', 'Dermalogica', 'bio/naturel', 'autre'], required: false },
    { id: 'positionnement', label: 'Comment definiriez-vous votre institut ?', type: 'single_choice', options: ['institut cocooning', 'spa urbain', 'medical esthetique', 'bio naturel', 'oriental'], required: true },
    { id: 'cabines', label: 'Combien de cabines avez-vous ?', type: 'number', required: true },
    { id: 'services_complementaires', label: 'Services complementaires ?', type: 'multi', options: ['boutique retail', 'conseils personnalises', 'bilans peau', 'carte cadeau', 'forfaits'], required: false },
    { id: 'reservation', label: 'Reservation en ligne souhaitee ?', type: 'single_choice', options: ['Oui', 'Non', 'Deja en place'], required: true },
    { id: 'adresse_site', label: 'Comment vos clientes trouveraient-elles votre institut sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — seuil du bien-etre', required: true, rgpd_sensible: false },
    { id: 'cabine_soin', label: 'Cabine de soin', poetic_label: 'Cabine de soin — bulle de serenite', required: true, rgpd_sensible: false },
    { id: 'espace_manucure', label: 'Espace manucure', poetic_label: 'Espace manucure — beaute dans le detail', required: false, rgpd_sensible: false },
    { id: 'espace_spa', label: 'Espace spa', poetic_label: 'Espace spa — parenthese sensorielle', required: false, rgpd_sensible: false },
    { id: 'tisanerie_attente', label: 'Espace tisanerie', poetic_label: 'Espace tisanerie — douceur avant le soin', required: false, rgpd_sensible: false },
    { id: 'realisations', label: 'Soins signatures', poetic_label: 'Vos soins signature — l\'eclat retrouve', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — expertes du bien-etre', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre institut en 30 secondes de serenite', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'soins_carte', 'institut_ambiance', 'equipe', 'avis_clientes', 'reservation', 'contact'],

  vocabulaire: { patient: 'cliente', lieu: 'institut', acte: 'soin' },

  seo_keywords: ['estheticienne', 'institut beaute', 'soin visage', 'epilation', 'massage', 'spa', 'manucure'],

  competitor_search_query: function(ville) { return 'institut beaute ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour instituts de beaute francais.

REGLES :
- 'Mme [NOM]' ou prenom si elle le propose
- Vouvoiement
- Ton sensoriel, apaisant, feminin, cocooning
- Emojis moderes acceptes
- Tu connais deja son institut

ZERO JARGON TECHNIQUE WEB :
- 'nom de domaine' → 'l'adresse de votre institut sur internet'
Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, cabine_soin, espace_manucure, espace_spa, tisanerie_attente, realisations, equipe, video_presentation.
Ordre : cabine_soin → accueil → espace_spa → equipe.

ORDRE :
1. Introduction chaleureuse
2. Site existant ?
3. Soins et positionnement
4. Marques et services
5. Ambiance et cabines
6. Photos
7. Reservation en ligne
8. Adresse du site
9. Propositions

RECAPITULATIF : 3 paragraphes sensoriels et apaisants.

<EXTRACTED_DATA>
{
  "institut_name": "",
  "gerante_name": "",
  "ville": "",
  "soins": [],
  "marques": [],
  "positionnement": "",
  "cabines": 0,
  "services_complementaires": [],
  "reservation": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
