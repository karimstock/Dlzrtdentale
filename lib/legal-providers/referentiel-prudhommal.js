// =============================================
// JADOMI — Référentiel Prud'homal
// Cerveau juridique : données de référence et
// fonctions utilitaires pour le droit prud'homal
// français (Code du travail, conventions collectives,
// barèmes, format conclusions, mode juge).
// =============================================

'use strict';

// ─────────────────────────────────────────────
// 1. SECTIONS CPH (art. L.1423-1, R.1423-1 C. trav.)
// ─────────────────────────────────────────────

const SECTIONS_CPH = {
  encadrement: {
    code: 'encadrement',
    label: 'Encadrement',
    description: 'Cadres, ingénieurs, agents de maîtrise assimilés cadres et VRP multicarte.',
    prefixes_naf: [], // toutes NAF si statut cadre
    mots_cles: [
      'cadre', 'directeur', 'ingénieur', 'responsable', 'manager',
      'chef de service', 'VRP', 'agent commercial', 'dirigeant salarié'
    ]
  },
  industrie: {
    code: 'industrie',
    label: 'Industrie',
    description: 'Salariés des entreprises industrielles (hors cadres).',
    prefixes_naf: [
      '05', '06', '07', '08', '09', // extractives
      '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
      '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
      '30', '31', '32', '33', // manufacturières
      '35', // énergie
      '36', '37', '38', '39' // eau, assainissement, déchets
    ],
    mots_cles: [
      'ouvrier', 'technicien', 'opérateur', 'conducteur de ligne',
      'soudeur', 'électricien', 'mécanicien', 'usinage', 'production'
    ]
  },
  commerce: {
    code: 'commerce',
    label: 'Commerce et services commerciaux',
    description: 'Salariés des entreprises commerciales, de la distribution et des services commerciaux.',
    prefixes_naf: [
      '45', '46', '47', // commerce gros et détail
      '49', '50', '51', '52', '53', // transport et entreposage
      '55', '56', // hébergement, restauration
      '58', '59', '60', '61', '62', '63', // information, communication
      '64', '65', '66', // finance, assurance
      '68', // immobilier
      '69', '70', '71', '72', '73', '74', '75', // activités spécialisées
      '77', '78', '79', '80', '81', '82' // services administratifs
    ],
    mots_cles: [
      'vendeur', 'commercial', 'caissier', 'magasinier',
      'serveur', 'cuisinier', 'réceptionniste', 'livreur',
      'conseiller clientèle', 'assistant commercial'
    ]
  },
  agriculture: {
    code: 'agriculture',
    label: 'Agriculture',
    description: 'Salariés des exploitations et entreprises agricoles (art. L.1423-1 al. 4 C. trav.).',
    prefixes_naf: [
      '01', '02', '03' // agriculture, sylviculture, pêche
    ],
    mots_cles: [
      'agriculteur', 'ouvrier agricole', 'viticulteur', 'jardinier',
      'paysagiste', 'horticulteur', 'éleveur', 'bûcheron', 'marin pêcheur'
    ]
  },
  activites_diverses: {
    code: 'activites_diverses',
    label: 'Activités diverses',
    description: 'Salariés relevant d\'activités non couvertes par les quatre autres sections : professions libérales, enseignement privé, santé, associations, employés de maison, concierges, gardiens, artistes.',
    prefixes_naf: [
      '84', '85', '86', '87', '88', // administration, enseignement, santé, social
      '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'
    ],
    mots_cles: [
      'aide à domicile', 'garde d\'enfants', 'assistant maternel',
      'concierge', 'gardien', 'artiste', 'enseignant', 'formateur',
      'infirmier libéral', 'aide-soignant', 'secrétaire médicale',
      'employé de maison'
    ]
  }
};

/**
 * Détermine la section CPH compétente.
 * @param {string} poste - intitulé du poste du salarié
 * @param {boolean} statusCadre - true si statut cadre ou assimilé
 * @param {string} [nafEmployeur] - code NAF de l'employeur (ex. '62.01Z')
 * @returns {{ code: string, label: string, confiance: string }}
 */
function determinerSection(poste, statusCadre, nafEmployeur) {
  // Règle 1 : les cadres relèvent toujours de la section encadrement
  if (statusCadre) {
    return {
      code: 'encadrement',
      label: SECTIONS_CPH.encadrement.label,
      confiance: 'haute'
    };
  }

  const posteNorm = (poste || '').toLowerCase();

  // Règle 2 : mots-clés encadrement même sans statut déclaré
  const motsEncadrement = ['directeur', 'directrice', 'vrp', 'agent commercial'];
  if (motsEncadrement.some(m => posteNorm.includes(m))) {
    return {
      code: 'encadrement',
      label: SECTIONS_CPH.encadrement.label,
      confiance: 'moyenne'
    };
  }

  // Règle 3 : par code NAF
  if (nafEmployeur) {
    const prefixe = nafEmployeur.replace(/\./g, '').substring(0, 2);
    for (const [code, section] of Object.entries(SECTIONS_CPH)) {
      if (code === 'encadrement') continue;
      if (section.prefixes_naf.includes(prefixe)) {
        return { code, label: section.label, confiance: 'haute' };
      }
    }
  }

  // Règle 4 : par mots-clés du poste
  for (const [code, section] of Object.entries(SECTIONS_CPH)) {
    if (code === 'encadrement') continue;
    if (section.mots_cles.some(mc => posteNorm.includes(mc))) {
      return { code, label: section.label, confiance: 'moyenne' };
    }
  }

  // Défaut : activités diverses
  return {
    code: 'activites_diverses',
    label: SECTIONS_CPH.activites_diverses.label,
    confiance: 'basse'
  };
}


// ─────────────────────────────────────────────
// 2. STADES PROCÉDURAUX
// ─────────────────────────────────────────────

const STADES_PROCEDURAUX = {
  saisine: {
    code: 'saisine',
    label: 'Saisine du Conseil de prud\'hommes',
    order: 1,
    base_legale: 'Art. R.1452-1 et R.1452-2 C. trav.',
    document_type: 'requete',
    format: 'Requête introductive d\'instance (formulaire Cerfa n°15586*03 ou requête libre)',
    destinataire: 'Greffe du Conseil de prud\'hommes compétent',
    mentions_obligatoires: [
      'Identité complète du demandeur (nom, prénoms, nationalité, date et lieu de naissance, adresse)',
      'Identité et adresse du défendeur',
      'Objet de la demande',
      'Exposé sommaire des motifs',
      'Liste des pièces',
      'Indication de la section compétente',
      'Montant des demandes chiffrées'
    ]
  },
  bco: {
    code: 'bco',
    label: 'Bureau de conciliation et d\'orientation (BCO)',
    order: 2,
    base_legale: 'Art. L.1454-1 et R.1454-10 C. trav.',
    document_type: 'conclusions_bco',
    format: 'Conclusions en vue de la conciliation (facultatif mais recommandé)',
    destinataire: 'Bureau de conciliation et d\'orientation',
    mentions_obligatoires: [
      'Exposé succinct du litige',
      'Demandes chiffrées',
      'Base de conciliation envisagée',
      'Propositions transactionnelles le cas échéant'
    ]
  },
  mise_en_etat: {
    code: 'mise_en_etat',
    label: 'Mise en état',
    order: 3,
    base_legale: 'Art. R.1454-18 à R.1454-20 C. trav. (réforme décret 2016-660 du 20 mai 2016)',
    document_type: 'conclusions',
    format: 'Conclusions récapitulatives avec bordereau de pièces communiquées',
    destinataire: 'Conseiller rapporteur désigné par le BCO',
    mentions_obligatoires: [
      'Rappel de la procédure',
      'Exposé des faits',
      'Discussion juridique structurée',
      'Dispositif récapitulatif de l\'ensemble des demandes',
      'Bordereau de pièces numérotées et communiquées'
    ]
  },
  bureau_jugement: {
    code: 'bureau_jugement',
    label: 'Bureau de jugement',
    order: 4,
    base_legale: 'Art. L.1454-1-1, R.1454-19 et R.1454-28 C. trav.',
    document_type: 'conclusions_recapitulatives',
    format: 'Conclusions récapitulatives et définitives',
    destinataire: 'Bureau de jugement (2 conseillers employeurs + 2 conseillers salariés)',
    mentions_obligatoires: [
      'Rappel complet de la procédure',
      'Exposé détaillé des faits',
      'Discussion en droit structurée (I, II, III...)',
      'Dispositif récapitulatif avec chiffrage de chaque demande',
      'Bordereau de pièces complet et numéroté',
      'Mention des textes applicables (Code du travail, CCN)',
      'Référence aux pièces pour chaque argument'
    ]
  },
  departage: {
    code: 'departage',
    label: 'Départage',
    order: 5,
    base_legale: 'Art. L.1454-2 C. trav.',
    document_type: 'conclusions_departage',
    format: 'Conclusions en formation de départage',
    destinataire: 'Juge départiteur (magistrat professionnel) + conseillers prud\'homaux',
    mentions_obligatoires: [
      'Mention du renvoi en départage',
      'Date de l\'audience de départage',
      'Reprise intégrale des demandes',
      'Actualisation éventuelle des demandes',
      'Dispositif récapitulatif actualisé'
    ]
  },
  jugement: {
    code: 'jugement',
    label: 'Jugement',
    order: 6,
    base_legale: 'Art. R.1454-25 à R.1454-28 C. trav.',
    document_type: 'note_delibere',
    format: 'Note en délibéré (exceptionnelle, sur autorisation du président)',
    destinataire: 'Président du bureau de jugement',
    mentions_obligatoires: [
      'Autorisation préalable du président',
      'Réponse limitée aux arguments soulevés après clôture des débats',
      'Communication contradictoire'
    ]
  },
  appel: {
    code: 'appel',
    label: 'Appel',
    order: 7,
    base_legale: 'Art. R.1461-1 C. trav., art. 901 et s. CPC',
    document_type: 'conclusions_appel',
    format: 'Conclusions d\'appelant ou d\'intimé conformes à l\'art. 954 CPC',
    destinataire: 'Chambre sociale de la Cour d\'appel',
    mentions_obligatoires: [
      'Déclaration d\'appel dans le délai d\'un mois (art. R.1461-1 C. trav.)',
      'Conclusions d\'appelant dans les 3 mois (art. 908 CPC)',
      'Conclusions d\'intimé dans les 3 mois suivants (art. 909 CPC)',
      'Dispositif récapitulatif obligatoire (art. 954 CPC)',
      'Énoncer les chefs du jugement critiqués',
      'Formuler expressément les prétentions et moyens en fait et en droit',
      'Bordereau de pièces'
    ]
  },
  cassation: {
    code: 'cassation',
    label: 'Pourvoi en cassation',
    order: 8,
    base_legale: 'Art. 604 et s. CPC, art. R.1461-2 C. trav.',
    document_type: 'memoire_cassation',
    format: 'Mémoire ampliatif (obligatoirement par avocat au Conseil d\'État et à la Cour de cassation)',
    destinataire: 'Chambre sociale de la Cour de cassation',
    mentions_obligatoires: [
      'Pourvoi dans les 2 mois de la signification de l\'arrêt',
      'Mémoire ampliatif dans les 5 mois du pourvoi',
      'Moyens de cassation articulés (violation de la loi, défaut de base légale, défaut de motifs)',
      'Visa du texte prétendument violé',
      'Représentation obligatoire par avocat aux Conseils'
    ]
  }
};


// ─────────────────────────────────────────────
// 3. CCN LES PLUS FRÉQUENTES AUX PRUD'HOMMES
// ─────────────────────────────────────────────

const CCN_PRUDHOMMES = [
  {
    idcc: 3248,
    nom: 'Convention collective nationale de la métallurgie',
    section_cph_defaut: 'industrie',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { moins_2_ans: '3 mois', plus_2_ans: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle métallurgie (art. 73 nouvelle CCN)',
      calcul: '1/4 de mois par année d\'ancienneté pour les 10 premières années, puis 1/3 de mois par année au-delà de 10 ans. Majorée pour les cadres : 1/3 de mois par année dès la 1ère année si ancienneté > 7 ans.',
      avantage_vs_legal: true
    },
    particularites: [
      'Nouvelle convention unique depuis le 1er janvier 2024',
      'Classification par emplois repères et cotation de poste',
      'Garanties spécifiques cadres (délai de carence, maintien de salaire)'
    ]
  },
  {
    idcc: 1486,
    nom: 'Convention collective nationale des bureaux d\'études techniques (Syntec)',
    section_cph_defaut: 'encadrement',
    preavis: {
      etam: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { moins_2_ans: '3 mois', plus_2_ans: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle Syntec (art. 19)',
      calcul: 'ETAM : 1/4 de mois par année d\'ancienneté. Cadres : 1/3 de mois par année d\'ancienneté.',
      avantage_vs_legal: true
    },
    particularites: [
      'Forfait jours cadres très encadré (accord individuel écrit obligatoire)',
      'Classification ETAM / Ingénieurs et Cadres',
      'Prime de vacances obligatoire (1% masse salariale brute des congés payés)'
    ]
  },
  {
    idcc: 2098,
    nom: 'Convention collective nationale du personnel des prestataires de services dans le domaine du secteur tertiaire',
    section_cph_defaut: 'commerce',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité légale applicable (pas de disposition plus favorable)',
      calcul: null,
      avantage_vs_legal: false
    },
    particularites: [
      'Couvre les centres d\'appels, télétravail, externalisation',
      'Grille de classification spécifique (employé, agent de maîtrise, cadre)',
      'Clause de mobilité fréquente'
    ]
  },
  {
    idcc: 1979,
    nom: 'Convention collective nationale des hôtels, cafés, restaurants (HCR)',
    section_cph_defaut: 'commerce',
    preavis: {
      non_cadre: { moins_6_mois: '8 jours', de_6_mois_a_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle HCR (avenant n°6 du 15 décembre 2009)',
      calcul: '1/4 de mois par année pour les 10 premières années, puis 1/3 de mois au-delà. Identique au légal depuis la réforme 2017.',
      avantage_vs_legal: false
    },
    particularites: [
      'Avantages en nature repas obligatoires (évaluation forfaitaire)',
      'Heures supplémentaires majorées à 10% de la 36e à la 39e heure',
      'Jours fériés garantis (10 jours après 1 an d\'ancienneté)'
    ]
  },
  {
    idcc: 2264,
    nom: 'Convention collective nationale de l\'hospitalisation privée',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle hospitalisation privée',
      calcul: '1/4 de mois par année pour les 10 premières années, puis 1/3 de mois au-delà de 10 ans.',
      avantage_vs_legal: false
    },
    particularites: [
      'Travail de nuit et astreintes spécifiquement réglementés',
      'Sujétions particulières : dimanches, jours fériés',
      'Prime d\'ancienneté conventionnelle'
    ]
  },
  {
    idcc: 1740,
    nom: 'Convention collective nationale des ouvriers employés par les entreprises du bâtiment (jusqu\'à 10 salariés)',
    section_cph_defaut: 'industrie',
    preavis: {
      ouvrier: { moins_3_mois: '2 jours', de_3_mois_a_2_ans: '2 semaines', plus_2_ans: '2 semaines' },
      etam: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle BTP ouvriers',
      calcul: 'Après 2 ans : 1/4 de mois par année d\'ancienneté pour les 10 premières années, puis 1/3 de mois au-delà.',
      avantage_vs_legal: false
    },
    particularites: [
      'Intempéries : indemnisation spécifique',
      'Congés payés gérés par la caisse CIBTP',
      'Indemnités de petits déplacements (trajet, transport, repas)',
      'Chômage-intempéries'
    ]
  },
  {
    idcc: 2120,
    nom: 'Convention collective nationale de la banque',
    section_cph_defaut: 'commerce',
    preavis: {
      technicien: { tous: '1 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle banque (art. 29)',
      calcul: 'Techniciens : 1/5 de mois par année + 2/15 de mois par année au-delà de 10 ans. Cadres : plus favorable entre le légal et le conventionnel.',
      avantage_vs_legal: false
    },
    particularites: [
      'Garantie d\'emploi en cas de maladie (maintien renforcé)',
      'Classification spécifique (techniciens des métiers de la banque, cadres)',
      '13e mois conventionnel'
    ]
  },
  {
    idcc: 2148,
    nom: 'Convention collective nationale des télécommunications',
    section_cph_defaut: 'commerce',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle télécoms (art. 4.3.6)',
      calcul: '1/3 de mois par année d\'ancienneté pour les cadres. 1/4 de mois par année d\'ancienneté pour les non-cadres.',
      avantage_vs_legal: true
    },
    particularites: [
      'Forfait jours très utilisé',
      'Astreintes spécifiques (maintenance réseau)',
      'Formation professionnelle renforcée'
    ]
  },
  {
    idcc: 1501,
    nom: 'Convention collective nationale de la restauration rapide',
    section_cph_defaut: 'commerce',
    preavis: {
      employe: { moins_6_mois: '15 jours', de_6_mois_a_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité légale applicable',
      calcul: null,
      avantage_vs_legal: false
    },
    particularites: [
      'Avantage en nature repas (un repas par service effectué)',
      'Temps d\'habillage/déshabillage à compenser',
      'Coupures limitées dans la journée'
    ]
  },
  {
    idcc: 573,
    nom: 'Convention collective nationale du commerce de gros',
    section_cph_defaut: 'commerce',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle commerce de gros',
      calcul: '1/5 de mois par année d\'ancienneté + 2/15 de mois par année au-delà de 10 ans.',
      avantage_vs_legal: false
    },
    particularites: [
      'Classification ouvriers, employés, agents de maîtrise, cadres',
      'Prime d\'ancienneté conventionnelle (3% à partir de 3 ans)',
      'Prévoyance obligatoire'
    ]
  },
  {
    idcc: 44,
    nom: 'Convention collective nationale des industries chimiques',
    section_cph_defaut: 'industrie',
    preavis: {
      ouvrier_employe: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      agent_maitrise: { tous: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle chimie (accord du 17 mars 1975)',
      calcul: 'Ouvriers/employés : 3/10 de mois par année d\'ancienneté (plafonné à 10 mois). Agents de maîtrise : 4/10 de mois par année. Cadres : 5/10 de mois par année (plafonné à 15 mois).',
      avantage_vs_legal: true
    },
    particularites: [
      'Indemnité de licenciement très favorable',
      'Garanties maladie longue durée renforcées',
      'Travail posté (3x8) très encadré',
      'Prime d\'ancienneté conventionnelle progressive'
    ]
  },
  {
    idcc: 176,
    nom: 'Convention collective nationale de l\'industrie pharmaceutique',
    section_cph_defaut: 'industrie',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle pharmacie (art. 33)',
      calcul: 'Groupes 1 à 5 : 3/10 de mois par année d\'ancienneté. Groupes 6 et plus : 4/10 de mois par année. Cadres supérieurs (groupes 9+) : 5/10 de mois.',
      avantage_vs_legal: true
    },
    particularites: [
      'Indemnité conventionnelle très favorable',
      'Classification par groupes et niveaux',
      'Travail en environnement réglementé (BPF)',
      'Prime d\'ancienneté'
    ]
  },
  {
    idcc: 1517,
    nom: 'Convention collective nationale du commerce de détail non alimentaire',
    section_cph_defaut: 'commerce',
    preavis: {
      employe: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité légale applicable',
      calcul: null,
      avantage_vs_legal: false
    },
    particularites: [
      'Large périmètre (bijouterie, brocante, cadeaux, mercerie, etc.)',
      'Travail dominical encadré',
      'Grille de classification par échelons'
    ]
  },
  {
    idcc: 1518,
    nom: 'Convention collective nationale de l\'animation',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle animation (art. 4.4.3)',
      calcul: '1/4 de mois par année d\'ancienneté pour les 10 premières années, puis 1/3 de mois au-delà.',
      avantage_vs_legal: false
    },
    particularites: [
      'Contrats d\'engagement éducatif (CEE) pour les séjours de vacances',
      'Modulation du temps de travail spécifique',
      'Prévoyance et retraite complémentaire obligatoires'
    ]
  },
  {
    idcc: 2511,
    nom: 'Convention collective nationale du sport',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle sport (art. 12.4)',
      calcul: '1/4 de mois par année d\'ancienneté (identique au légal pour les 10 premières années).',
      avantage_vs_legal: false
    },
    particularites: [
      'CDD d\'usage pour les sportifs professionnels (art. L.1242-2, 3° C. trav.)',
      'Temps de travail modulable (saisons sportives)',
      'Sportifs professionnels : statut spécifique'
    ]
  },
  {
    idcc: 2941,
    nom: 'Convention collective nationale de la branche de l\'aide, de l\'accompagnement, des soins et des services à domicile (BAD)',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle aide à domicile (art. 36)',
      calcul: '1/4 de mois par année d\'ancienneté pour les 10 premières années, puis 1/3 de mois au-delà.',
      avantage_vs_legal: false
    },
    particularites: [
      'Temps de déplacement entre deux interventions pris en compte',
      'Indemnités kilométriques conventionnelles',
      'Modulation du temps de travail sur l\'année'
    ]
  },
  {
    idcc: 3127,
    nom: 'Convention collective nationale des entreprises de services à la personne',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité légale applicable',
      calcul: null,
      avantage_vs_legal: false
    },
    particularites: [
      'Temps partiel très fréquent',
      'Multi-employeurs possible',
      'Prise en charge des frais de transport'
    ]
  },
  {
    idcc: 1266,
    nom: 'Convention collective nationale de la restauration collective',
    section_cph_defaut: 'commerce',
    preavis: {
      employe: { moins_6_mois: '15 jours', de_6_mois_a_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle restauration collective',
      calcul: '1/10 de mois par année d\'ancienneté + 1/15 de mois supplémentaire par année au-delà de 10 ans.',
      avantage_vs_legal: false
    },
    particularites: [
      'Garantie d\'emploi en cas de perte de marché (art. 1.17)',
      'Transfert conventionnel du personnel',
      'Avantage en nature repas'
    ]
  },
  {
    idcc: 1043,
    nom: 'Convention collective nationale des gardiens, concierges et employés d\'immeubles',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      categorie_a: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      categorie_b: { moins_2_ans: '1 mois', plus_2_ans: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle gardiens (art. 22)',
      calcul: '1/4 de mois par année d\'ancienneté pour les 10 premières années, puis 1/3 de mois au-delà.',
      avantage_vs_legal: false
    },
    particularites: [
      'Logement de fonction (avantage en nature)',
      'Catégorie A (sans logement) et B (avec logement)',
      'Délai de libération du logement en cas de rupture : 3 mois (cat. B)',
      'Unités de valeur pour le calcul de la rémunération'
    ]
  },
  {
    idcc: 1516,
    nom: 'Convention collective nationale des organismes de formation',
    section_cph_defaut: 'activites_diverses',
    preavis: {
      non_cadre: { moins_2_ans: '1 mois', plus_2_ans: '2 mois' },
      cadre: { tous: '3 mois' }
    },
    formule_indemnite: {
      description: 'Indemnité conventionnelle formation (art. 11.3)',
      calcul: '1/5 de mois par année d\'ancienneté + 2/15 de mois par année au-delà de 10 ans.',
      avantage_vs_legal: false
    },
    particularites: [
      'Formateurs : temps de préparation pris en compte',
      'CDD d\'usage possible pour les formateurs occasionnels',
      'Grille de classification spécifique (6 catégories)'
    ]
  }
];

/**
 * Retrouve une CCN par son IDCC.
 * @param {number} idcc
 * @returns {object|null}
 */
function trouverCCN(idcc) {
  return CCN_PRUDHOMMES.find(ccn => ccn.idcc === idcc) || null;
}

/**
 * Compare l'indemnité légale et conventionnelle de licenciement.
 * L'indemnité légale est définie par les art. L.1234-9 et R.1234-2 C. trav.
 * @param {number} anciennete - ancienneté en années (peut être décimale)
 * @param {number} salaire - salaire de référence mensuel brut
 * @param {number} [idcc] - IDCC de la convention collective
 * @returns {{ legale: number, conventionnelle: number|null, la_plus_favorable: string, detail: string }}
 */
function comparerIndemnites(anciennete, salaire, idcc) {
  if (anciennete < 0.6667) { // 8 mois minimum (art. L.1234-9 C. trav.)
    return {
      legale: 0,
      conventionnelle: null,
      la_plus_favorable: 'aucune',
      detail: 'Ancienneté insuffisante (minimum 8 mois requis par l\'art. L.1234-9 C. trav.)'
    };
  }

  // Indemnité légale : art. R.1234-2 C. trav.
  // 1/4 de mois par année pour les 10 premières années
  // 1/3 de mois par année au-delà de 10 ans
  let legale = 0;
  if (anciennete <= 10) {
    legale = (1 / 4) * salaire * anciennete;
  } else {
    legale = (1 / 4) * salaire * 10 + (1 / 3) * salaire * (anciennete - 10);
  }
  legale = Math.round(legale * 100) / 100;

  let conventionnelle = null;
  let detail = '';

  if (idcc) {
    const ccn = trouverCCN(idcc);
    if (ccn && ccn.formule_indemnite && ccn.formule_indemnite.avantage_vs_legal) {
      // Calculs conventionnels spécifiques
      switch (idcc) {
        case 44: // Chimie — ouvriers/employés : 3/10 par année, plafonné 10 mois
          conventionnelle = Math.min((3 / 10) * salaire * anciennete, 10 * salaire);
          detail = 'Chimie (IDCC 44) — 3/10 de mois par année, plafonné à 10 mois de salaire';
          break;
        case 176: // Pharma — groupes 1-5 : 3/10 par année
          conventionnelle = (3 / 10) * salaire * anciennete;
          detail = 'Industrie pharmaceutique (IDCC 176) — 3/10 de mois par année (groupes 1-5)';
          break;
        case 3248: // Métallurgie — 1/4 pour 10 ans puis 1/3 au-delà, majoré cadres
          if (anciennete <= 10) {
            conventionnelle = (1 / 4) * salaire * anciennete;
          } else {
            conventionnelle = (1 / 4) * salaire * 10 + (1 / 3) * salaire * (anciennete - 10);
          }
          // Majoration cadres si ancienneté > 7 ans (approximation sans connaître le statut)
          detail = 'Métallurgie (IDCC 3248) — 1/4 par année ≤10 ans, 1/3 au-delà. Majoration cadres possible.';
          break;
        case 1486: // Syntec — cadres : 1/3 par année
          conventionnelle = (1 / 3) * salaire * anciennete;
          detail = 'Syntec (IDCC 1486) — 1/3 de mois par année (cadres)';
          break;
        case 2148: // Télécoms — cadres : 1/3 par année
          conventionnelle = (1 / 3) * salaire * anciennete;
          detail = 'Télécommunications (IDCC 2148) — 1/3 de mois par année (cadres)';
          break;
        default:
          detail = ccn.formule_indemnite.description;
          break;
      }
      if (conventionnelle !== null) {
        conventionnelle = Math.round(conventionnelle * 100) / 100;
      }
    } else if (ccn) {
      detail = 'Pas de disposition conventionnelle plus favorable — indemnité légale applicable.';
    } else {
      detail = 'IDCC non trouvé dans le référentiel.';
    }
  }

  const la_plus_favorable = conventionnelle !== null && conventionnelle > legale
    ? 'conventionnelle'
    : 'legale';

  return { legale, conventionnelle, la_plus_favorable, detail };
}


// ─────────────────────────────────────────────
// 4. FORMAT CONCLUSIONS CPH
// ─────────────────────────────────────────────

const FORMAT_CONCLUSIONS = {
  entete_type: `CONSEIL DE PRUD'HOMMES DE [VILLE]
Section : [SECTION]
RG n° [NUMÉRO RG]

CONCLUSIONS [RÉCAPITULATIVES] [EN RÉPLIQUE]
[AU FOND / EN VUE DE LA CONCILIATION / DE DÉPARTAGE]

POUR :     [Civilité] [Prénom] [NOM], né(e) le [date] à [lieu]
           Demeurant [adresse complète]
           [Salarié(e) / Ancien(ne) salarié(e)]
           DEMANDEUR [/ DÉFENDEUR]

Ayant pour avocat :
           Maître [Prénom] [NOM]
           Avocat au Barreau de [ville]
           [Adresse cabinet]
           [Toque n°]

CONTRE :   [Raison sociale employeur]
           [Forme juridique], au capital de [montant] euros
           Immatriculée au RCS de [ville] sous le n° [SIRET]
           Dont le siège social est [adresse]
           Représentée par [son dirigeant / son avocat]
           DÉFENDEUR [/ DEMANDEUR RECONVENTIONNEL]`,

  structure: {
    introduction: 'Rappel de la procédure (saisine, dates d\'audience, mesures du BCO)',
    partie_i: 'I. RAPPEL DES FAITS\n   Chronologie détaillée des faits avec renvoi aux pièces (Pièce n°X)',
    partie_ii: 'II. DISCUSSION EN DROIT\n   A. Sur le premier chef de demande\n      1. En droit (textes, jurisprudence)\n      2. En l\'espèce (application aux faits)\n   B. Sur le deuxième chef de demande\n      (même structure)\n   C. Etc.',
    partie_iii: 'III. SUR LES DEMANDES RECONVENTIONNELLES (le cas échéant)\n   Réponse point par point aux demandes adverses'
  },

  dispositif: `PAR CES MOTIFS

Vu les articles [textes visés],
Vu les pièces versées aux débats,

[Civilité] [NOM] demande au Conseil de prud'hommes de bien vouloir :

- DIRE ET JUGER [qualifier la demande principale]
- CONDAMNER [l'employeur] à verser à [Civilité] [NOM] les sommes suivantes :
  * [Montant] euros à titre de [nature de l'indemnité] ;
  * [Montant] euros à titre de [nature de l'indemnité] ;
  * [Montant] euros au titre des congés payés afférents ;
- ORDONNER [remise des documents, astreinte, etc.]
- DIRE que les sommes porteront intérêts au taux légal à compter de [la saisine / la notification du jugement]
- ORDONNER la capitalisation des intérêts conformément à l'article 1343-2 du Code civil
- CONDAMNER [l'employeur] aux entiers dépens
- CONDAMNER [l'employeur] à verser la somme de [montant] euros au titre de l'article 700 du Code de procédure civile

Sous le bénéfice de ce qui précède et de tout autre à déduire ou suppléer,
Avec exécution provisoire de droit (art. R.1454-28 C. trav.) [ou : demander l'exécution provisoire si non de droit]`,

  bordereau: `BORDEREAU DE COMMUNICATION DE PIÈCES

Pièce n°1 :  [Description] — [nb] page(s)
Pièce n°2 :  [Description] — [nb] page(s)
Pièce n°3 :  [Description] — [nb] page(s)
[...]

Toutes les pièces ci-dessus ont été communiquées à la partie adverse par [RPVA / lettre RAR / remise en main propre contre décharge] le [date].`
};


// ─────────────────────────────────────────────
// 5. MENTIONS OBLIGATOIRES PAR TYPE DE DOCUMENT
// ─────────────────────────────────────────────

const MENTIONS_OBLIGATOIRES = {
  requete: {
    label: 'Requête introductive d\'instance',
    base_legale: 'Art. R.1452-2 C. trav.',
    mentions: [
      { champ: 'identite_demandeur', detail: 'Nom, prénoms, nationalité, date et lieu de naissance, adresse du demandeur', obligatoire: true, base_legale: 'Art. R.1452-2, 1° C. trav.' },
      { champ: 'identite_defendeur', detail: 'Dénomination, SIRET et adresse du défendeur (employeur)', obligatoire: true, base_legale: 'Art. R.1452-2, 2° C. trav.' },
      { champ: 'objet_demande', detail: 'Objet de la demande avec exposé sommaire des motifs', obligatoire: true, base_legale: 'Art. R.1452-2, 3° C. trav.' },
      { champ: 'montant_demandes', detail: 'Montant des demandes chiffrées pour chaque chef de prétention', obligatoire: true, base_legale: 'Art. R.1452-2, 3° C. trav.' },
      { champ: 'section_competente', detail: 'Section du CPH saisie (encadrement, industrie, commerce, agriculture, activités diverses)', obligatoire: true, base_legale: 'Art. R.1423-1 C. trav.' },
      { champ: 'liste_pieces', detail: 'Liste des pièces jointes à la requête', obligatoire: true, base_legale: 'Art. R.1452-2, 4° C. trav.' },
      { champ: 'lieu_travail', detail: 'Lieu de travail habituel ou dernier lieu de travail', obligatoire: false, base_legale: 'Art. R.1412-1 C. trav. (compétence territoriale)' },
      { champ: 'convention_collective', detail: 'Convention collective applicable', obligatoire: false, base_legale: 'Recommandé pour la détermination de la section' }
    ]
  },
  conclusions: {
    label: 'Conclusions récapitulatives',
    base_legale: 'Art. R.1453-5 C. trav.',
    mentions: [
      { champ: 'juridiction', detail: 'Identification du Conseil de prud\'hommes', obligatoire: true, base_legale: 'Art. R.1453-5 C. trav.' },
      { champ: 'section_rg', detail: 'Section et numéro de RG', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'identite_parties', detail: 'Identité complète des parties (demandeur et défendeur)', obligatoire: true, base_legale: 'Art. 56 CPC' },
      { champ: 'avocat', detail: 'Nom, barreau, adresse et toque de l\'avocat', obligatoire: true, base_legale: 'Art. R.1453-2 C. trav.' },
      { champ: 'rappel_procedure', detail: 'Historique procédural (dates, mesures, renvois)', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'faits', detail: 'Exposé chronologique des faits avec renvoi aux pièces', obligatoire: true, base_legale: 'Art. 56 CPC' },
      { champ: 'discussion_droit', detail: 'Discussion en droit structurée (textes + jurisprudence)', obligatoire: true, base_legale: 'Art. 56 CPC' },
      { champ: 'dispositif', detail: 'PAR CES MOTIFS — récapitulatif de toutes les demandes chiffrées', obligatoire: true, base_legale: 'Art. R.1453-5 C. trav.' },
      { champ: 'bordereau_pieces', detail: 'Bordereau numéroté des pièces communiquées', obligatoire: true, base_legale: 'Art. 132 CPC' }
    ]
  },
  bordereau: {
    label: 'Bordereau de communication de pièces',
    base_legale: 'Art. 132 CPC',
    mentions: [
      { champ: 'numero_piece', detail: 'Numérotation continue des pièces', obligatoire: true, base_legale: 'Art. 132 CPC' },
      { champ: 'description_piece', detail: 'Description précise de chaque pièce', obligatoire: true, base_legale: 'Art. 132 CPC' },
      { champ: 'nombre_pages', detail: 'Nombre de pages par pièce', obligatoire: false, base_legale: 'Recommandé' },
      { champ: 'date_communication', detail: 'Date et mode de communication à la partie adverse', obligatoire: true, base_legale: 'Art. 132 CPC' }
    ]
  },
  mise_en_demeure: {
    label: 'Mise en demeure préalable',
    base_legale: 'Art. 1344 Code civil',
    mentions: [
      { champ: 'identite_expediteur', detail: 'Identité complète du salarié (ou de son avocat)', obligatoire: true, base_legale: 'Formalisme LRAR' },
      { champ: 'identite_destinataire', detail: 'Raison sociale et adresse du siège de l\'employeur', obligatoire: true, base_legale: 'Formalisme LRAR' },
      { champ: 'objet', detail: 'Mention « MISE EN DEMEURE » visible', obligatoire: true, base_legale: 'Art. 1344 C. civ.' },
      { champ: 'rappel_obligation', detail: 'Rappel de l\'obligation inexécutée avec textes applicables', obligatoire: true, base_legale: 'Art. 1344 C. civ.' },
      { champ: 'delai', detail: 'Délai raisonnable accordé (8 à 15 jours)', obligatoire: true, base_legale: 'Jurisprudence constante' },
      { champ: 'consequences', detail: 'Annonce des suites judiciaires en cas d\'inexécution', obligatoire: false, base_legale: 'Recommandé' },
      { champ: 'lrar', detail: 'Envoi par lettre recommandée avec accusé de réception', obligatoire: true, base_legale: 'Art. 1344 C. civ.' }
    ]
  },
  renvoi: {
    label: 'Demande de renvoi',
    base_legale: 'Art. R.1454-19 C. trav.',
    mentions: [
      { champ: 'juridiction_section_rg', detail: 'CPH, section et numéro RG', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'identite_parties', detail: 'Identité des parties', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'date_audience', detail: 'Date de l\'audience pour laquelle le renvoi est demandé', obligatoire: true, base_legale: 'Art. R.1454-19 C. trav.' },
      { champ: 'motif', detail: 'Motif légitime du renvoi', obligatoire: true, base_legale: 'Jurisprudence Cass. soc.' },
      { champ: 'accord_partie_adverse', detail: 'Indication de l\'accord ou refus de la partie adverse', obligatoire: false, base_legale: 'Recommandé' }
    ]
  },
  substitution: {
    label: 'Demande de substitution de conseil',
    base_legale: 'Art. R.1453-2 C. trav.',
    mentions: [
      { champ: 'identite_partie', detail: 'Identité de la partie représentée', obligatoire: true, base_legale: 'Art. R.1453-2 C. trav.' },
      { champ: 'ancien_conseil', detail: 'Nom et barreau de l\'ancien avocat', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'nouveau_conseil', detail: 'Nom, barreau et adresse du nouveau conseil', obligatoire: true, base_legale: 'Art. R.1453-2 C. trav.' },
      { champ: 'date_substitution', detail: 'Date effective de la substitution', obligatoire: true, base_legale: 'Usage juridictionnel' },
      { champ: 'notification_adversaire', detail: 'Notification à la partie adverse du changement', obligatoire: true, base_legale: 'Art. R.1453-2 C. trav.' }
    ]
  },
  rpva: {
    label: 'Communication par RPVA (Réseau Privé Virtuel Avocats)',
    base_legale: 'Art. 748-1 CPC, arrêté du 30 mars 2011',
    mentions: [
      { champ: 'identification_avocat', detail: 'Identification RPVA de l\'avocat émetteur (clé de signature)', obligatoire: true, base_legale: 'Art. 748-6 CPC' },
      { champ: 'juridiction_destinataire', detail: 'Juridiction destinataire', obligatoire: true, base_legale: 'Art. 748-1 CPC' },
      { champ: 'numero_rg', detail: 'Numéro de RG du dossier', obligatoire: true, base_legale: 'Art. 748-1 CPC' },
      { champ: 'nature_acte', detail: 'Nature de l\'acte de procédure transmis', obligatoire: true, base_legale: 'Art. 748-1 CPC' },
      { champ: 'accuse_reception', detail: 'Accusé de réception électronique valant date de remise', obligatoire: true, base_legale: 'Art. 748-3 CPC' }
    ]
  }
};


// ─────────────────────────────────────────────
// 6. MODE JUGE — Grille d'évaluation
// ─────────────────────────────────────────────

const MODE_JUGE = {
  criteres: [
    {
      code: 'completude_dispositif',
      label: 'Complétude du dispositif',
      poids: 20,
      description: 'Toutes les demandes sont-elles chiffrées dans le dispositif ? Rien n\'est oublié ? Le dispositif est-il auto-suffisant pour rédiger le jugement ?'
    },
    {
      code: 'qualite_juridique',
      label: 'Qualité de l\'argumentation juridique',
      poids: 20,
      description: 'Les textes visés sont-ils pertinents ? La jurisprudence est-elle actualisée ? Les syllogismes sont-ils rigoureux ?'
    },
    {
      code: 'structure',
      label: 'Structure et lisibilité',
      poids: 15,
      description: 'Le plan est-il logique (I/II/III, A/B/C) ? Le lecteur trouve-t-il immédiatement l\'information cherchée ? Les titres sont-ils explicites ?'
    },
    {
      code: 'preuve_faits',
      label: 'Qualité de la preuve et des faits',
      poids: 15,
      description: 'Chaque allégation est-elle étayée par une pièce ? Les renvois aux pièces sont-ils systématiques ? La chronologie est-elle claire ?'
    },
    {
      code: 'qualite_bordereau',
      label: 'Qualité du bordereau de pièces',
      poids: 10,
      description: 'Les pièces sont-elles numérotées, décrites précisément, classées dans l\'ordre du dossier ? Le bordereau est-il exploitable ?'
    },
    {
      code: 'chiffrage',
      label: 'Précision du chiffrage',
      poids: 10,
      description: 'Les calculs sont-ils détaillés (base × taux × durée) ? Les montants bruts et nets sont-ils distingués ? Les congés payés afférents sont-ils demandés ?'
    },
    {
      code: 'presentation',
      label: 'Présentation et formalisme',
      poids: 5,
      description: 'Orthographe irréprochable ? Mise en page soignée ? Pagination ? Vouvoiement de rigueur ?'
    },
    {
      code: 'anticipation_contradictoire',
      label: 'Anticipation du contradictoire',
      poids: 5,
      description: 'Les arguments prévisibles de l\'adversaire sont-ils anticipés et réfutés par avance ?'
    }
  ],

  erreurs_qui_agacent_les_juges: [
    {
      code: 'dispositif_incomplet',
      gravite: 'FATALE',
      description: 'Demande discutée dans les motifs mais absente du dispositif — le juge ne peut pas statuer ultra petita.',
      consequence: 'La demande oubliée sera considérée comme abandonnée.'
    },
    {
      code: 'chiffrage_absent',
      gravite: 'FATALE',
      description: 'Demande formulée sans montant chiffré dans le dispositif.',
      consequence: 'Irrecevabilité de la demande (art. R.1452-2 C. trav.).'
    },
    {
      code: 'pieces_non_communiquees',
      gravite: 'FATALE',
      description: 'Pièces visées dans les conclusions mais non communiquées à l\'adversaire ni au greffe.',
      consequence: 'Pièces écartées des débats (art. 135 CPC). Argumentation privée de support.'
    },
    {
      code: 'conclusions_non_recapitulatives',
      gravite: 'GRAVE',
      description: 'Conclusions qui ne reprennent pas l\'intégralité des prétentions — le juge ne statue que sur les dernières conclusions.',
      consequence: 'Art. R.1453-5 C. trav. — les demandes des précédentes conclusions non reprises sont réputées abandonnées.'
    },
    {
      code: 'confusion_brut_net',
      gravite: 'GRAVE',
      description: 'Pas de distinction entre montants bruts et nets dans les demandes salariales.',
      consequence: 'Le juge condamnera en brut par défaut. Le salarié peut perdre la partie charges patronales.'
    },
    {
      code: 'jurisprudence_obsolete',
      gravite: 'SERIEUSE',
      description: 'Citation d\'arrêts cassés, renversés ou qui ne sont plus la jurisprudence en vigueur.',
      consequence: 'Perte de crédibilité de l\'argumentation.'
    },
    {
      code: 'plan_confus',
      gravite: 'SERIEUSE',
      description: 'Conclusions sans plan clair, arguments mélangés, répétitions, absence de structure.',
      consequence: 'Le juge, surchargé, risque de ne pas comprendre la demande et de la rejeter.'
    },
    {
      code: 'absence_conges_payes',
      gravite: 'SERIEUSE',
      description: 'Oubli des congés payés afférents sur les demandes de rappel de salaire (10%).',
      consequence: 'Le juge ne peut pas accorder ce qui n\'est pas demandé — perte sèche de 10%.'
    },
    {
      code: 'faits_sans_preuve',
      gravite: 'SERIEUSE',
      description: 'Allégations de fait sans renvoi à une pièce justificative.',
      consequence: 'L\'affirmation non étayée sera écartée par le juge.'
    },
    {
      code: 'copier_coller_visible',
      gravite: 'SERIEUSE',
      description: 'Noms d\'autres parties, numéros RG erronés, références à un autre dossier — signe évident de copier-coller.',
      consequence: 'Perte de crédibilité. Le juge remet en question la rigueur de l\'ensemble du dossier.'
    }
  ],

  pieces_essentielles: {
    licenciement: [
      'Contrat de travail (et avenants)',
      'Bulletins de salaire (12 derniers mois minimum)',
      'Lettre de convocation à l\'entretien préalable',
      'Lettre de licenciement',
      'Attestation Pôle emploi / France Travail',
      'Certificat de travail',
      'Solde de tout compte',
      'Convention collective applicable',
      'Justificatifs de recherche d\'emploi (si demande de préjudice)',
      'Échanges écrits antérieurs au licenciement'
    ],
    harcelement: [
      'Certificats médicaux (médecin traitant et médecin du travail)',
      'Arrêts de travail successifs',
      'Courriels, SMS, messages (captures horodatées)',
      'Attestations de collègues (conformes art. 202 CPC)',
      'Compte-rendu de visites médicales (médecine du travail)',
      'Main courante ou plainte pénale le cas échéant',
      'Dossier d\'alerte éventuelle auprès du CSE / de l\'employeur',
      'Déclaration d\'accident du travail ou maladie professionnelle',
      'Évaluation annuelle / compte-rendu d\'entretien',
      'Organigramme et positionnement hiérarchique'
    ],
    heures_supp: [
      'Décompte hebdomadaire précis des heures travaillées',
      'Planning ou emploi du temps',
      'Mails / messages envoyés en dehors des horaires (horodatage)',
      'Badgeage / pointeuse (si existant)',
      'Attestations de collègues sur les horaires',
      'Bulletins de salaire (vérifier les heures mentionnées)',
      'Contrat de travail (durée conventionnelle)',
      'Convention collective (contingent annuel, majoration)'
    ],
    discrimination: [
      'Panel de comparaison (collègues de même ancienneté, même poste, autre sexe/âge/etc.)',
      'Bulletins de salaire du salarié et du panel (si obtenus)',
      'Historique d\'évolution de carrière',
      'Compte-rendu d\'entretiens annuels',
      'Courriels ou propos discriminatoires (captures)',
      'Attestations de témoins (conformes art. 202 CPC)',
      'Statistiques internes si disponibles (répartition H/F par catégorie, etc.)',
      'Candidatures internes refusées',
      'Registre unique du personnel (extraits)'
    ],
    inaptitude: [
      'Avis d\'inaptitude du médecin du travail (formulaire réglementaire)',
      'Étude de poste et conditions de travail par le médecin du travail',
      'Échanges avec le médecin du travail',
      'Propositions de reclassement de l\'employeur',
      'Refus motivé du salarié (le cas échéant)',
      'Consultation du CSE sur le reclassement',
      'Lettre de licenciement pour inaptitude',
      'Certificats médicaux antérieurs',
      'Reconnaissance de maladie professionnelle ou AT (le cas échéant)',
      'Bulletin de salaire (maintien pendant la recherche de reclassement : 1 mois)'
    ]
  }
};


// ─────────────────────────────────────────────
// 7. BARÈME CONCILIATION BCO (art. D.1235-21 C. trav.)
// ─────────────────────────────────────────────
// Indemnité forfaitaire minimale en cas de conciliation
// devant le bureau de conciliation et d'orientation.
// Applicable uniquement en cas de licenciement injustifié
// (hors nullité). En mois de salaire brut.

const BAREME_CONCILIATION = {
  base_legale: 'Art. D.1235-21 C. trav. (décret n°2016-1581 du 23 novembre 2016)',
  description: 'Indemnité forfaitaire de conciliation versée par l\'employeur au salarié en cas d\'accord devant le BCO. Ces montants constituent un plancher ; les parties peuvent convenir de montants supérieurs.',
  table: [
    { anciennete_min: 0, anciennete_max: 1, mois_salaire: 2 },
    { anciennete_min: 1, anciennete_max: 2, mois_salaire: 3 },
    { anciennete_min: 2, anciennete_max: 8, mois_salaire: 4 },
    { anciennete_min: 8, anciennete_max: 12, mois_salaire: 8 },
    { anciennete_min: 12, anciennete_max: 15, mois_salaire: 10 },
    { anciennete_min: 15, anciennete_max: 19, mois_salaire: 12 },
    { anciennete_min: 19, anciennete_max: 23, mois_salaire: 14 },
    { anciennete_min: 23, anciennete_max: 25, mois_salaire: 16 },
    { anciennete_min: 25, anciennete_max: 29, mois_salaire: 18 },
    { anciennete_min: 29, anciennete_max: 30, mois_salaire: 20 },
    { anciennete_min: 30, anciennete_max: Infinity, mois_salaire: 24 }
  ],
  regime_fiscal: 'L\'indemnité de conciliation est exonérée d\'impôt sur le revenu et de cotisations sociales dans les limites de l\'art. 80 duodecies du CGI.',

  /**
   * Calcule l'indemnité forfaitaire de conciliation BCO.
   * @param {number} anciennete - ancienneté en années
   * @param {number} salaire - salaire mensuel brut de référence
   * @returns {{ mois: number, montant: number }}
   */
  calculer: function(anciennete, salaire) {
    const tranche = this.table.find(t => anciennete >= t.anciennete_min && anciennete < t.anciennete_max);
    if (!tranche) {
      return { mois: 24, montant: 24 * salaire };
    }
    return {
      mois: tranche.mois_salaire,
      montant: Math.round(tranche.mois_salaire * salaire * 100) / 100
    };
  }
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  SECTIONS_CPH,
  determinerSection,
  STADES_PROCEDURAUX,
  CCN_PRUDHOMMES,
  trouverCCN,
  comparerIndemnites,
  FORMAT_CONCLUSIONS,
  MENTIONS_OBLIGATOIRES,
  MODE_JUGE,
  BAREME_CONCILIATION
};
