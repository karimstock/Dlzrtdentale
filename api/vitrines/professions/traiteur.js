// =============================================
// JADOMI — Module Mon site internet
// professions/traiteur.js — Config complete
// =============================================

module.exports = {
  id: 'traiteur',
  label: 'Traiteur',
  label_plural: 'traiteurs',
  category: 'restauration',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'traiteur',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    { id: 'specialites', label: 'Quelles sont vos specialites ?', type: 'multi', options: ['mariage', 'entreprise', 'evenementiel', 'cocktail', 'food truck', 'plateaux-repas', 'gastronomique', 'oriental', 'mediterraneen'], required: true },
    { id: 'capacite', label: 'Quelle capacite maximum (nombre de convives) ?', type: 'number', required: true },
    { id: 'produits', label: 'Quelle est votre approche produits ?', type: 'free_text', required: true },
    { id: 'services', label: 'Quels services sont inclus ?', type: 'multi', options: ['materiel', 'service en salle', 'location vaisselle', 'decoration', 'sonorisation', 'livraison'], required: true },
    { id: 'zone_intervention', label: 'Quelle est votre zone d\'intervention ?', type: 'free_text', required: true },
    { id: 'menus_signatures', label: 'Decrivez vos menus signatures.', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre service sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'laboratoire', label: 'Laboratoire', poetic_label: 'Votre laboratoire — ou les plats naissent', required: true, rgpd_sensible: false },
    { id: 'buffets_realises', label: 'Buffets', poetic_label: 'Buffets realises — scenographie culinaire', required: true, rgpd_sensible: false },
    { id: 'plats_signatures', label: 'Plats signatures', poetic_label: 'Vos plats — signature du savoir-faire', required: true, rgpd_sensible: false },
    { id: 'salle_demo', label: 'Salle demo', poetic_label: 'Salle de demonstration — degustation avant evenement', required: false, rgpd_sensible: false },
    { id: 'equipe_brigade', label: 'Brigade', poetic_label: 'Votre brigade — professionnalisme en mouvement', required: false, rgpd_sensible: false },
    { id: 'evenements_realises', label: 'Evenements', poetic_label: 'Evenements — vos prestations en action', required: false, rgpd_sensible: false },
    { id: 'materiel_location', label: 'Materiel', poetic_label: 'Materiel — qualite jusqu\'au dernier detail', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre savoir-faire en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'prestations', 'menus_carte', 'realisations_evenements', 'equipe_brigade', 'avis_clients', 'contact_devis'],

  vocabulaire: { patient: 'client', lieu: 'laboratoire', acte: 'prestation' },

  seo_keywords: ['traiteur', 'traiteur mariage', 'traiteur evenementiel', 'traiteur entreprise', 'buffet', 'cocktail', 'plateaux repas'],

  competitor_search_query: function(ville) { return 'traiteur ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour traiteurs francais.

REGLES :
- 'M./Mme [NOM]' ou 'Chef [NOM]' si parcours gastronomique
- Vouvoiement
- Ton organise, creatif, fiable, professionnel
- Emojis moderes acceptes

ZERO JARGON WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='plats_signatures' required='true' />
Categories : laboratoire, buffets_realises, plats_signatures, salle_demo, equipe_brigade, evenements_realises, materiel_location, video_presentation.
Ordre : plats_signatures → buffets_realises → evenements_realises → laboratoire.

ORDRE :
1. Introduction
2. Site existant ?
3. Specialites et capacite
4. Produits et menus signatures
5. Services et zone
6. Photos
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes gourmands et professionnels.

<EXTRACTED_DATA>
{
  "traiteur_name": "",
  "gerant_name": "",
  "ville": "",
  "specialites": [],
  "capacite": 0,
  "produits": "",
  "services": [],
  "zone_intervention": "",
  "menus_signatures": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
