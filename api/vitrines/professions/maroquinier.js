// =============================================
// JADOMI — Module Mon site internet
// professions/maroquinier.js — Config complete
// =============================================

module.exports = {
  id: 'maroquinier',
  label: 'Maroquinier',
  label_plural: 'maroquiniers',
  category: 'artisan',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'atelier de maroquinerie',
  rgpd_strictness: 'low',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    { id: 'specialites', label: 'Quelles sont vos specialites ?', type: 'multi', options: ['sacs', 'petite maroquinerie', 'ceintures', 'reparation', 'sur-mesure', 'sellerie', 'gainage'], required: true },
    { id: 'cuirs', label: 'Quels cuirs travaillez-vous ?', type: 'multi', options: ['cuir tanne vegetal', 'box', 'vachette', 'exotique', 'vintage', 'pleine fleur'], required: true },
    { id: 'made_in_france', label: 'Fabrication francaise et atelier integre ?', type: 'single_choice', options: ['Oui, tout est fait en atelier', 'Partiellement', 'Non'], required: true },
    { id: 'services', label: 'Quels services ?', type: 'multi', options: ['nettoyage', 'teinture', 'reparation', 'personnalisation gravure', 'creation sur-mesure'], required: true },
    { id: 'philosophie', label: 'Quelle est la philosophie de votre atelier ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre atelier sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'vitrine', label: 'Vitrine', poetic_label: 'Votre vitrine — elegance au grand jour', required: true, rgpd_sensible: false },
    { id: 'atelier', label: 'Atelier', poetic_label: 'Votre atelier — ou le cuir prend vie', required: true, rgpd_sensible: false },
    { id: 'etabli_outils', label: 'Etabli', poetic_label: 'Etabli — la patine des outils', required: false, rgpd_sensible: false },
    { id: 'pieces_finies', label: 'Pieces finies', poetic_label: 'Pieces finies — l\'elegance du geste', required: true, rgpd_sensible: false },
    { id: 'detail_couture', label: 'Detail couture', poetic_label: 'Detail couture — la main du savoir-faire', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — mains expertes', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Le geste artisanal en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'creations_galerie', 'savoir_faire', 'atelier', 'services_reparation', 'contact'],

  vocabulaire: { patient: 'client', lieu: 'atelier', acte: 'creation' },

  seo_keywords: ['maroquinier', 'maroquinerie', 'sac cuir', 'reparation cuir', 'artisan cuir', 'maroquinerie francaise', 'sur mesure cuir'],

  competitor_search_query: function(ville) { return 'maroquinier ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour ateliers de maroquinerie francais.

REGLES :
- 'M./Mme [NOM]'
- Vouvoiement
- Ton artisanal, patient, noble, intemporel
- Jamais d'emojis

ZERO JARGON WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='atelier' required='true' />
Categories : vitrine, atelier, etabli_outils, pieces_finies, detail_couture, equipe, video_presentation.
Ordre : pieces_finies → atelier → detail_couture → vitrine.

ORDRE :
1. Introduction
2. Site existant ?
3. Specialites et cuirs
4. Made in France et atelier
5. Services et philosophie
6. Photos (le detail du geste artisanal est le vrai differentiant)
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes nobles et artisanaux.

<EXTRACTED_DATA>
{
  "atelier_name": "",
  "artisan_name": "",
  "ville": "",
  "specialites": [],
  "cuirs": [],
  "made_in_france": "",
  "services": [],
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
