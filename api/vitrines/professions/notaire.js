// =============================================
// JADOMI — Module Mon site internet
// professions/notaire.js — Config complete notaire
// =============================================

module.exports = {
  id: 'notaire',
  label: 'Notaire',
  label_plural: 'notaires',
  category: 'liberale',
  titre_politesse: 'Maitre',
  titre_source: 'lastname',
  description_courte: 'etude notariale',
  rgpd_strictness: 'high',
  import_sources_available: ['pagesjaunes', 'website'],

  questions: [
    { id: 'domaines', label: 'Quels sont vos domaines de pratique ?', type: 'multi', options: ['immobilier', 'famille', 'successions', 'entreprises', 'international', 'droit rural', 'urbanisme'], required: true },
    { id: 'clientele', label: 'Quelle est votre clientele ?', type: 'multi', options: ['particuliers', 'entreprises', 'agriculteurs', 'collectivites'], required: true },
    { id: 'equipe', label: 'Combien de notaires associes et collaborateurs ?', type: 'free_text', required: true },
    { id: 'chambre', label: 'Quelle est votre Chambre departementale ?', type: 'free_text', required: true },
    { id: 'langues', label: 'Langues pratiquees ?', type: 'multi', options: ['francais', 'anglais', 'allemand', 'espagnol', 'autre'], required: false },
    { id: 'services_differenciants', label: 'Proposez-vous des services differenciants ?', type: 'multi', options: ['signature electronique', 'visioconference', 'actes a distance', 'rendez-vous en soiree', 'permanences sans rendez-vous'], required: false },
    { id: 'philosophie', label: 'Quelle est la philosophie de votre etude ?', type: 'free_text', required: true },
    { id: 'adresse_site', label: 'Comment aimeriez-vous que vos clients trouvent votre etude sur internet ?', type: 'single_choice', options: ['Je laisse JADOMI choisir (recommande)', 'J\'ai deja une adresse', 'Je ne sais pas'], required: true }
  ],

  photo_categories: [
    { id: 'facade', label: 'Facade', poetic_label: 'Votre facade d\'office — ancrage territorial', required: true, rgpd_sensible: false },
    { id: 'accueil', label: 'Accueil', poetic_label: 'Votre accueil — la confiance au premier pas', required: true, rgpd_sensible: false },
    { id: 'salle_signature', label: 'Salle de signature', poetic_label: 'Salle de signature — l\'instant de l\'acte authentique', required: true, rgpd_sensible: false },
    { id: 'bureau_notarial', label: 'Bureau', poetic_label: 'Votre bureau — ou se scellent les engagements', required: false, rgpd_sensible: false },
    { id: 'bibliotheque_juridique', label: 'Bibliotheque', poetic_label: 'Bibliotheque juridique — la tradition preservee', required: false, rgpd_sensible: false },
    { id: 'equipe', label: 'Equipe', poetic_label: 'Vos collaborateurs — precision et rigueur au quotidien', required: false, rgpd_sensible: false },
    { id: 'portrait', label: 'Portrait', poetic_label: 'Votre portrait — garant de la confiance', required: true, rgpd_sensible: false },
    { id: 'video_presentation', label: 'Video', poetic_label: 'Votre etude en 30 secondes', required: false, rgpd_sensible: false, media_type: 'video' }
  ],

  suggested_sections: ['hero', 'domaines_intervention', 'etude_equipe', 'actualites_droit', 'outils_numeriques', 'contact'],

  vocabulaire: { patient: 'client', lieu: 'etude', acte: 'acte' },

  seo_keywords: ['notaire', 'etude notariale', 'acte authentique', 'succession', 'immobilier notaire', 'donation'],

  competitor_search_query: function(ville) { return 'notaire ' + ville; },

  system_prompt_intro: `Tu es l'assistant IA de JADOMI specialise dans la creation de sites internet pour etudes notariales francaises.

REGLES DE COMMUNICATION NON-NEGOCIABLES :
- Tu appelles TOUJOURS le professionnel 'Maitre [NOM]'
- Vouvoiement strict
- Ton institutionnel, rassurant, garant, tradition, serenite
- Jamais d'emojis
- Tu connais deja son etude — ne redemande pas ce que tu sais

REGLES DEONTOLOGIQUES (Reglement national du notariat) :
- Service public delegue — ton institutionnel obligatoire
- Pas de publicite commerciale
- Mentions officielles obligatoires : Chambre, CGDN
- Le notaire est un officier public, pas un commercant

REGLE DE VOCABULAIRE — ZERO JARGON TECHNIQUE WEB :
- 'nom de domaine' → 'l'adresse de votre etude sur internet'
- Pas de termes techniques. Rassure : 'JADOMI s'occupe de tout.'

PROTOCOLE DE DEMANDE DE PHOTOS :
<REQUEST_UPLOAD type='photo' category='facade' required='true' />
Categories : facade, accueil, salle_signature, bureau_notarial, bibliotheque_juridique, equipe, portrait, video_presentation.
UNE categorie a la fois. Ordre : facade → portrait → salle_signature → accueil.

TA MISSION :
Conversation posee pour creer le site de l'etude. Tu valorises la tradition, la confiance et le service public.

ORDRE :
1. Introduction (Maitre [Nom], son etude)
2. Site existant ?
3. Domaines de pratique
4. Clientele et Chambre
5. Equipe et services differenciants
6. Photos
7. Adresse du site
8. Propositions finales

RECAPITULATIF FINAL : 3 paragraphes institutionnels et rassurants.

<EXTRACTED_DATA>
{
  "etude_name": "",
  "notaire_name": "",
  "ville": "",
  "domaines": [],
  "clientele": [],
  "equipe": "",
  "chambre": "",
  "langues": [],
  "services_differenciants": [],
  "philosophie": "",
  "site_existant": "AUCUN|REMPLACER|GARDER",
  "adresse_site_choix": "jadomi|existante|aide",
  "sections_choisies": [],
  "palette_choisie": "",
  "suggestions_domaine": []
}
</EXTRACTED_DATA>`
};
