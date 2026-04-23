// =============================================
// JADOMI — Module Mon site internet
// professions/sage_femme.js — Config complete
// =============================================

module.exports = {
  id: 'sage_femme',
  label: 'Sage-femme',
  label_plural: 'sages-femmes',
  category: 'sante',
  titre_politesse: 'Mme',
  titre_source: 'lastname',
  description_courte: 'cabinet de sage-femme',
  rgpd_strictness: 'high',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    { id: 'domaines', label: 'Quels sont vos domaines d\'exercice ?', type: 'multi', options: ['suivi grossesse', 'preparation naissance', 'reeducation perinee', 'consultation gynecologique de prevention', 'contraception', 'suivi nouveau-ne', 'allaitement', 'echographie'], required: true },
    { id: 'lieu_exercice', label: 'Ou exercez-vous ?', type: 'single_choice', options: ['cabinet liberal', 'maternite', 'domicile', 'mixte'], required: true },
    { id: 'accompagnements', label: 'Proposez-vous des accompagnements specifiques ?', type: 'multi', options: ['projet de naissance', 'PMA', 'deuil perinatal', 'perinatalite psychologique', 'hypnose perinatale', 'yoga prenatal'], required: false },
    { id: 'public', label: 'Quel est votre public ?', type: 'multi', options: ['primipares', 'multipares', 'adolescentes', 'menopause', 'toute femme'], required: true },
    { id: 'philosophie', label: 'Quelle est votre philosophie d\'accompagnement ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos patientes trouveraient-elles votre cabinet sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — chaleur et confiance', required: true, rgpd_sensible: false },
    { id: 'salle_consultation', label: 'Consultation', poetic_label: 'Votre cabinet — intimite et serenite', required: true, rgpd_sensible: false },
    { id: 'espace_preparation', label: 'Preparation', poetic_label: 'Espace preparation — instant de partage', required: false, rgpd_sensible: false },
    { id: 'salle_reeducation', label: 'Reeducation', poetic_label: 'Salle de reeducation — retrouver son corps', required: false, rgpd_sensible: false },
    { id: 'equipement', label: 'Equipement', poetic_label: 'Vos outils — douceur et competence', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — presence et bienveillance', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre univers en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'domaines_exercice', 'accompagnement', 'parcours', 'infos_pratiques', 'contact'],

  vocabulaire: { patient: 'patiente', lieu: 'cabinet', acte: 'consultation' },

  seo_keywords: ['sage-femme', 'sage femme liberale', 'suivi grossesse', 'preparation naissance', 'reeducation perinee', 'allaitement'],

  competitor_search_query: function(ville) { return 'sage femme ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour sages-femmes liberales francaises.

REGLES :
- 'Mme [NOM]' (la grande majorite sont des femmes)
- Vouvoiement strict
- Ton bienveillant, feminin, rassurant, discret, accompagnant
- Jamais d'emojis
- Tu connais deja son cabinet

DEONTOLOGIE :
- Code de deontologie strict
- Pas de publicite
- Secret professionnel absolu
- Pas de temoignages de patientes identifiables
- Vocabulaire : 'patiente' (au feminin), 'accompagnement', 'consultation', 'ecoute', 'femmes'

ZERO JARGON TECHNIQUE WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, salle_consultation, espace_preparation, salle_reeducation, equipement, portrait, video_presentation.
UNE categorie a la fois. Ordre : portrait → salle_consultation → accueil → espace_preparation.

ORDRE :
1. Introduction bienveillante
2. Site existant ?
3. Domaines d'exercice et lieu
4. Accompagnements specifiques
5. Public et philosophie
6. Photos
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes bienveillants et accompagnants.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "sage_femme_name": "",
  "ville": "",
  "domaines": [],
  "lieu_exercice": "",
  "accompagnements": [],
  "public": [],
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
