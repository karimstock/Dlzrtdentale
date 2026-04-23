// =============================================
// JADOMI — Module Mon site internet
// professions/plombier.js — Config complete
// =============================================

module.exports = {
  id: 'plombier',
  label: 'Plombier',
  label_plural: 'plombiers',
  category: 'artisan',
  titre_politesse: 'M.',
  titre_source: 'lastname',
  description_courte: 'entreprise de plomberie',
  rgpd_strictness: 'low',
  import_sources_available: ['gmb', 'pagesjaunes', 'website'],

  questions: [
    { id: 'specialisations', label: 'Quelles sont vos specialisations ?', type: 'multi', options: ['depannage urgence', 'renovation salle de bain', 'chauffage gaz', 'pompes a chaleur', 'sanitaire', 'plomberie industrielle', 'detection fuites', 'chaudiere', 'canalisations', 'climatisation'], required: true },
    { id: 'certifications', label: 'Quelles certifications avez-vous ?', type: 'multi', options: ['RGE', 'QualiBat', 'QualiPac', 'QualiGaz', 'Qualibat', 'autre'], required: true },
    { id: 'zone_intervention', label: 'Quelle est votre zone d\'intervention ?', type: 'free_text', required: true },
    { id: 'assurance', label: 'Assurance decennale et assureur ?', type: 'free_text', required: true },
    { id: 'urgence_24h', label: 'Proposez-vous un depannage 24h/7j ?', type: 'single_choice', options: ['Oui', 'Non', 'En semaine uniquement'], required: true },
    { id: 'fabricants', label: 'Avec quels fabricants travaillez-vous ?', type: 'free_text', required: false },
    { id: 'services', label: 'Quels services proposez-vous ?', type: 'multi', options: ['devis gratuit', 'garantie pieces et main d\'oeuvre', 'réponse rapide', 'intervention sous 1h', 'entretien annuel'], required: true },
    { id: 'adresse_site', label: 'Comment vos clients trouveraient-ils votre entreprise sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'atelier_local', label: 'Atelier', poetic_label: 'Votre atelier — l\'organisation au service de la reactivite', required: false, rgpd_sensible: false },
    { id: 'vehicules_equipes', label: 'Vehicules', poetic_label: 'Vos vehicules — l\'intervention en mouvement', required: true, rgpd_sensible: false },
    { id: 'interventions_realisees', label: 'Interventions', poetic_label: 'Interventions realisees — avant/apres', required: true, rgpd_sensible: false },
    { id: 'installations_salle_bain', label: 'Salles de bain', poetic_label: 'Installations salle de bain — vos realisations', required: false, rgpd_sensible: false },
    { id: 'chaudieres_poses', label: 'Chaudieres', poetic_label: 'Chaudieres et PAC — expertise energetique', required: false, rgpd_sensible: false },
    { id: 'equipe_artisans', label: 'Equipe', poetic_label: 'Votre equipe d\'artisans — savoir-faire et reactivite', required: false, rgpd_sensible: false },
    { id: 'certifications', label: 'Certifications', poetic_label: 'Vos certifications — gage de qualite', required: false, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre entreprise en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'services_depannage', 'realisations', 'certifications_confiance', 'zone_intervention', 'avis_clients', 'contact_urgence'],

  vocabulaire: { patient: 'client', lieu: 'entreprise', acte: 'intervention' },

  seo_keywords: ['plombier', 'plombier chauffagiste', 'depannage plomberie', 'plombier urgence', 'renovation salle de bain', 'pompe a chaleur', 'chaudiere'],

  competitor_search_query: function(ville) { return 'plombier ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour entreprises de plomberie francaises.

REGLES :
- 'M./Mme [NOM]'
- Vouvoiement
- Ton rassurant, reactif, competent, concret
- Pas d'emojis excessifs
- Tu connais deja son entreprise

ZERO JARGON WEB :
- 'nom de domaine' → 'l'adresse de votre entreprise sur internet'
Rassure : 'JADOMI s'occupe de tout le cote technique.'

PROTOCOLE PHOTOS :
<REQUEST_UPLOAD type='photo' category='interventions_realisees' required='true' />
Categories : atelier_local, vehicules_equipes, interventions_realisees, installations_salle_bain, chaudieres_poses, equipe_artisans, certifications, video_presentation.
Ordre : interventions_realisees → vehicules_equipes → installations_salle_bain → certifications.

ORDRE :
1. Introduction directe et pragmatique
2. Site existant ?
3. Specialisations et certifications
4. Zone d'intervention et urgence 24h
5. Services et garanties
6. Photos (les realisations avant/apres sont le meilleur argument commercial)
7. Adresse
8. Propositions

RECAPITULATIF : 3 paragraphes concrets et rassurants.

<EXTRACTED_DATA>
{
  "entreprise_name": "",
  "gerant_name": "",
  "ville": "",
  "specialisations": [],
  "certifications": [],
  "zone_intervention": "",
  "assurance": "",
  "urgence_24h": "",
  "fabricants": "",
  "services": [],
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
