// =============================================
// JADOMI — Module Mon site internet
// professions/bijoutier.js — Config complete
// =============================================

module.exports = {
  id: 'bijoutier',
  label: 'Bijoutier',
  label_plural: 'bijoutiers',
  category: 'commerce',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'bijouterie',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    { id: 'type', label: 'Quel type de bijouterie ?', type: 'multi', options: ['bijouterie traditionnelle', 'joaillerie', 'createur', 'horlogerie', 'reparations', 'sur-mesure', 'seconde main luxe'], required: true },
    { id: 'specialites', label: 'Quelles sont vos specialites ?', type: 'multi', options: ['or', 'argent', 'plaque or', 'pierres precieuses', 'perles', 'acier', 'alliances mariage', 'bijoux bapteme', 'montres'], required: true },
    { id: 'services', label: 'Quels services proposez-vous ?', type: 'multi', options: ['reparation', 'creation sur-mesure', 'gravure', 'expertise estimation', 'pieces exception', 'nettoyage', 'teinture'], required: true },
    { id: 'atelier', label: 'Avez-vous un atelier sur place ?', type: 'single_choice', options: ['Oui', 'Non'], required: true },
    { id: 'marques', label: 'Distribuez-vous des marques ?', type: 'free_text', required: false },
    { id: 'philosophie', label: 'Quelle est l\'identite de votre maison ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre bijouterie sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'vitrine', label: 'Vitrine', poetic_label: 'Votre vitrine — ecrin des tresors', required: true, rgpd_sensible: false },
    { id: 'interieur_boutique', label: 'Boutique', poetic_label: 'Votre boutique — scenographie du precieux', required: true, rgpd_sensible: false },
    { id: 'atelier_creation', label: 'Atelier', poetic_label: 'Votre atelier — ou nait l\'eclat', required: false, rgpd_sensible: false },
    { id: 'pieces_signatures', label: 'Pieces signatures', poetic_label: 'Pieces signatures — savoir-faire artisanal', required: true, rgpd_sensible: false },
    { id: 'vitrines_themes', label: 'Vitrines thematiques', poetic_label: 'Vitrines thematiques — mariage, fetes, quotidien', required: false, rgpd_sensible: false },
    { id: 'portrait_artisan', label: 'Portrait', poetic_label: 'Portrait artisan — le geste qui transforme le metal', required: true, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — conseil precieux', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'L\'eclat en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'creations_galerie', 'services_atelier', 'marques', 'sur_mesure', 'avis_clients', 'contact'],

  vocabulaire: { patient: 'client', lieu: 'boutique', acte: 'creation' },

  seo_keywords: ['bijoutier', 'bijouterie', 'joaillerie', 'alliance mariage', 'bijou or', 'creation bijou', 'reparation bijou'],

  competitor_search_query: function(ville) { return 'bijoutier ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour bijouteries et joailleries francaises.

REGLES :
- 'M./Mme [NOM]'
- Vouvoiement
- Ton precieux, artisanal, confidentiel, intemporel
- Jamais d'emojis
- Tu connais deja sa boutique

ZERO JARGON WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='vitrine' required='true' />
Categories : vitrine, interieur_boutique, atelier_creation, pieces_signatures, vitrines_themes, portrait_artisan, equipe, video_presentation.
Ordre : pieces_signatures → vitrine → atelier_creation → portrait.

ORDRE :
1. Introduction
2. Site existant ?
3. Type de bijouterie et specialites
4. Services et atelier
5. Identite et philosophie
6. Photos (les pieces d'abord — c'est le premier reflexe des clients)
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes precieux et artisanaux.

<EXTRACTED_DATA>
{
  "boutique_name": "",
  "gerant_name": "",
  "ville": "",
  "type": [],
  "specialites": [],
  "services": [],
  "atelier": "",
  "marques": "",
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
