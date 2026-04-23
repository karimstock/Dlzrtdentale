// =============================================
// JADOMI — Module Mon site internet
// professions/orthoptiste.js — Config complete
// =============================================

module.exports = {
  id: 'orthoptiste',
  label: 'Orthoptiste',
  label_plural: 'orthoptistes',
  category: 'sante',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'cabinet d\'orthoptie',
  rgpd_strictness: 'high',
  import_sources_available: ['gmb', 'doctolib', 'pagesjaunes', 'website'],

  questions: [
    { id: 'specialisations', label: 'Quelles sont vos specialisations ?', type: 'multi', options: ['reeducation visuelle', 'basse vision', 'strabisme', 'explorations fonctionnelles', 'depistages', 'neuro-ophtalmologie'], required: true },
    { id: 'public', label: 'Quel est votre public ?', type: 'multi', options: ['enfants', 'adultes', 'seniors', 'pathologies specifiques'], required: true },
    { id: 'equipements', label: 'De quels equipements disposez-vous ?', type: 'multi', options: ['synoptophore', 'test de Hess', 'perimetre', 'tonometre', 'OCT', 'retinographe'], required: false },
    { id: 'prescripteurs', label: 'Avec quels prescripteurs travaillez-vous ?', type: 'multi', options: ['ophtalmologistes', 'medecins generalistes', 'neurologues', 'pediatres'], required: false },
    { id: 'philosophie', label: 'Quelle est votre approche du soin visuel ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos patients trouveraient-ils votre cabinet sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — avant l\'examen du regard', required: true, rgpd_sensible: false },
    { id: 'salle_examen', label: 'Salle d\'examen', poetic_label: 'Salle d\'examen — precision du regard analyse', required: true, rgpd_sensible: false },
    { id: 'equipement_specialise', label: 'Equipement', poetic_label: 'Vos instruments optiques — exactitude clinique', required: false, rgpd_sensible: false },
    { id: 'espace_reeducation', label: 'Reeducation', poetic_label: 'Espace de reeducation — entrainer la vision', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — precision et bienveillance', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre cabinet en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'specialisations', 'equipements', 'parcours', 'infos_pratiques', 'contact'],

  vocabulaire: { patient: 'patient', lieu: 'cabinet', acte: 'bilan' },

  seo_keywords: ['orthoptiste', 'bilan orthoptique', 'reeducation visuelle', 'strabisme', 'basse vision', 'orthoptie'],

  competitor_search_query: function(ville) { return 'orthoptiste ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets d'orthoptie francais.

REGLES :
- 'M./Mme [NOM]'
- Vouvoiement strict
- Ton pedagogique, precis, patient
- Jamais d'emojis

DEONTOLOGIE : Pas de promesse de guerison. Information medicale validee uniquement.

ZERO JARGON TECHNIQUE WEB. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, salle_examen, equipement_specialise, espace_reeducation, portrait, video_presentation.
UNE categorie a la fois. Ordre : portrait → salle_examen → accueil.

ORDRE :
1. Introduction
2. Site existant ?
3. Specialisations et public
4. Equipements et prescripteurs
5. Philosophie
6. Photos
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes precis et pedagogiques.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "praticien_name": "",
  "ville": "",
  "specialisations": [],
  "public": [],
  "equipements": [],
  "prescripteurs": [],
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
