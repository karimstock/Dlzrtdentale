// =============================================
// JADOMI — Module Mon site internet
// professions/expert_comptable.js — Config complete
// =============================================

module.exports = {
  id: 'expert_comptable',
  label: 'Expert-comptable',
  label_plural: 'experts-comptables',
  category: 'liberale',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'cabinet d\'expertise comptable',
  rgpd_strictness: 'high',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    { id: 'specialisations', label: 'Quelles sont vos specialisations sectorielles ?', type: 'multi', options: ['TPE', 'PME', 'grands comptes', 'BNC', 'BIC', 'medical', 'BTP', 'restauration', 'professions liberales', 'associations', 'e-commerce', 'startups'], required: true },
    { id: 'services', label: 'Quels services proposez-vous ?', type: 'multi', options: ['comptabilite', 'fiscalite', 'social et paie', 'conseil', 'audit', 'creation entreprise', 'patrimoine', 'transmission'], required: true },
    { id: 'outils_digitaux', label: 'Quels outils digitaux utilisez-vous ?', type: 'multi', options: ['logiciels cloud', 'dematerialisation', 'signature electronique', 'outils collaboratifs', 'portail client'], required: false },
    { id: 'certifications', label: 'Certifications et qualifications ?', type: 'free_text', required: false },
    { id: 'equipe', label: 'Composition du cabinet ?', type: 'free_text', required: true },
    { id: 'ordre_regional', label: 'Ordre Regional de rattachement ?', type: 'free_text', required: true },
    { id: 'philosophie', label: 'Quelle est votre approche du metier ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre cabinet sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — la clarte comme premier contact', required: true, rgpd_sensible: false },
    { id: 'open_space', label: 'Open-space', poetic_label: 'Votre open-space — transparence et efficacite', required: false, rgpd_sensible: false },
    { id: 'salle_reunion_client', label: 'Salle de reunion', poetic_label: 'Salle de reunion — pedagogie financiere', required: true, rgpd_sensible: false },
    { id: 'bureau_expert', label: 'Bureau', poetic_label: 'Votre bureau — l\'expertise concentree', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Votre equipe — precision et accompagnement', required: false, rgpd_sensible: false },
    { id: 'outils_digitaux', label: 'Outils', poetic_label: 'Votre environnement digital — modernite au service du conseil', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — chef d\'orchestre de vos finances', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre cabinet en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'services_expertise', 'specialisations_sectorielles', 'outils_modernite', 'equipe', 'contact'],

  vocabulaire: { patient: 'client', lieu: 'cabinet', acte: 'mission' },

  seo_keywords: ['expert comptable', 'cabinet comptable', 'expertise comptable', 'comptable', 'bilan comptable', 'creation entreprise'],

  competitor_search_query: function(ville) { return 'expert comptable ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour cabinets d'expertise comptable francais.

REGLES DE COMMUNICATION :
- 'M./Mme [NOM]'
- Vouvoiement strict
- Ton pragmatique, methodique, pedagogue, moderne
- Jamais d'emojis
- Tu connais deja son cabinet

REGLES DEONTOLOGIQUES :
- Obligation de mentions : Ordre, numero d'inscription, SIRET
- Pas de comparatif. Pas de demarchage oral non sollicite.

ZERO JARGON TECHNIQUE WEB :
- 'nom de domaine' → 'l'adresse de votre cabinet sur internet'
Rassure : 'JADOMI s'occupe de tout le cote technique.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='accueil' required='true' />
Categories : accueil, open_space, salle_reunion_client, bureau_expert, equipe, outils_digitaux, portrait, video_presentation.
Ordre : portrait → accueil → salle_reunion_client → equipe.

ORDRE CONVERSATION :
1. Introduction
2. Site existant ?
3. Services et specialisations
4. Outils digitaux et modernite
5. Equipe et philosophie
6. Photos
7. Adresse du site
8. Propositions finales

RECAPITULATIF : 3 paragraphes pragmatiques et modernes.

<EXTRACTED_DATA>
{
  "cabinet_name": "",
  "expert_name": "",
  "ville": "",
  "specialisations": [],
  "services": [],
  "outils_digitaux": [],
  "certifications": "",
  "equipe": "",
  "ordre_regional": "",
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
