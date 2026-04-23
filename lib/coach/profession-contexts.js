// =============================================
// JADOMI — Coach JADOMI
// profession-contexts.js — Contextes par métier
// =============================================

const CONTEXTS = {

  avocat: {
    titre: 'Maître',
    salutation: 'Ravi de vous accueillir dans JADOMI.',
    description: 'Votre cabinet juridique numérique est prêt. JADOMI va vous aider à gérer vos dossiers, vos clients et votre visibilité en ligne.',
    features: [
      {
        icon: '🎬',
        title: 'Votre site vitrine',
        description: 'Présentez votre cabinet avec une vidéo hero, vos expertises et votre équipe. Modifiable à tout moment.',
        cta: 'Voir mon site',
        route: '/public/vitrines/mon-site-v2.html'
      },
      {
        icon: '📅',
        title: 'Prise de RDV en ligne',
        description: 'Vos clients réservent directement un créneau. Confirmation email automatique.',
        cta: 'Configurer mes créneaux',
        route: '/public/vitrines/rendez-vous.html'
      },
      {
        icon: '🔐',
        title: 'Espace client sécurisé',
        description: 'Partagez des documents confidentiels avec vos clients en toute sécurité.',
        cta: 'Activer',
        route: '/public/vitrines/espace-client.html'
      },
      {
        icon: '💬',
        title: 'Chatbot IA cabinet',
        description: 'Répond aux questions simples de vos visiteurs 24/7 et les oriente vers vous.',
        cta: 'Personnaliser',
        route: '#chatbot'
      },
      {
        icon: '📊',
        title: 'Analytics visiteurs',
        description: 'Qui consulte vos expertises ? Quels jours ? Optimisez votre contenu.',
        cta: 'Voir les stats',
        route: '#analytics'
      },
      {
        icon: '💰',
        title: 'Facturation',
        description: 'Générez vos notes d\'honoraires, suivez les paiements.',
        cta: 'Configurer',
        route: '#compta'
      }
    ],
    quickwins: [
      { label: 'Personnalisez votre site vitrine', action: 'edit-site', route: '/public/vitrines/mon-site-v2.html' },
      { label: 'Créez votre premier créneau de RDV', action: 'create-slot', route: '/public/vitrines/rendez-vous.html' },
      { label: 'Publiez votre première actualité', action: 'new-post', route: '#blog' }
    ],
    tooltips: {
      'sidebar-site': { icon: '🎬', title: 'Mon site internet', description: 'Gérez votre site vitrine premium : pages, contenu, thème, photos. Publiez en 1 clic.' },
      'sidebar-dossiers': { icon: '📁', title: 'Dossiers clients', description: 'Créez et suivez les dossiers de vos clients. Documents, messages, timeline.' },
      'sidebar-rdv': { icon: '📅', title: 'Agenda & RDV', description: 'Configurez vos créneaux de disponibilité. Vos clients réservent en ligne.' },
      'sidebar-compta': { icon: '💰', title: 'Honoraires & Facturation', description: 'Générez des notes d\'honoraires, suivez les paiements, exportez pour votre comptable.' },
      'sidebar-chatbot': { icon: '💬', title: 'Chatbot IA', description: 'Votre assistant virtuel répond aux visiteurs 24/7. Personnalisez les FAQ et le ton.' },
      'sidebar-analytics': { icon: '📊', title: 'Statistiques', description: 'Visiteurs, pages vues, expertises les plus consultées. Optimisez votre présence.' },
      'btn-publier': { icon: '🚀', title: 'Publier', description: 'Mettez votre site en ligne en 1 clic. Modifiable à tout moment après publication.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouveaux RDV, messages clients, alertes importantes. Tout au même endroit.' }
    }
  },

  dentiste: {
    titre: 'Docteur',
    metier_affichage: 'chirurgien-dentiste',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet dentaire connecté. JADOMI optimise votre stock, vos commandes et votre site web.',
    features: [
      {
        icon: '📦',
        title: 'Stock intelligent',
        description: 'Panier IA qui optimise vos commandes. Économies -15% garanties via GPO.',
        cta: 'Voir mon stock',
        route: '#stock'
      },
      {
        icon: '🛒',
        title: '3 modes de commande',
        description: 'Rapide classique, JADOMI optimisée (queue auction), ou groupée régionale.',
        cta: 'Commander',
        route: '#commandes'
      },
      {
        icon: '🤝',
        title: 'Paniers groupés',
        description: 'Rejoignez d\'autres cabinets pour économiser jusqu\'à -25%.',
        cta: 'Voir les campagnes',
        route: '#paniers-groupes'
      },
      {
        icon: '📸',
        title: 'Scanner factures IA',
        description: 'Glissez une facture, l\'IA ajoute les produits à votre stock.',
        cta: 'Scanner',
        route: '#scanner'
      },
      {
        icon: '🌱',
        title: 'JADOMI Green',
        description: 'Vendez vos surplus de stock à prix réduit entre confrères.',
        cta: 'Mettre en vente',
        route: '#green'
      },
      {
        icon: '🆘',
        title: 'SOS Stock',
        description: 'Urgence de matériel ? Les confrères de votre région peuvent dépanner.',
        cta: 'Activer',
        route: '#sos'
      }
    ],
    quickwins: [
      { label: 'Scannez votre dernière facture fournisseur', action: 'scan-invoice', route: '#scanner' },
      { label: 'Créez votre premier panier intelligent', action: 'create-cart', route: '#panier' },
      { label: 'Configurez votre cabinet (adresse, horaires)', action: 'cabinet-setup', route: '#parametres' }
    ],
    tooltips: {
      'sidebar-stock': { icon: '📦', title: 'Stock intelligent', description: 'Vue complète de votre inventaire. Alertes péremption, niveaux critiques, suggestions de commande IA.' },
      'sidebar-commandes': { icon: '🛒', title: 'Commandes', description: '3 modes de commande : rapide, optimisé GPO, ou groupée régionale. Économies garanties.' },
      'sidebar-groupes': { icon: '🤝', title: 'Paniers groupés', description: 'Campagnes de groupage 48h. 5 cabinets minimum. Économies -15% à -30%.' },
      'sidebar-scanner': { icon: '📸', title: 'Scanner IA', description: 'Glissez une facture PDF ou photo. L\'IA extrait les produits et met à jour votre stock.' },
      'sidebar-green': { icon: '🌱', title: 'JADOMI Green', description: 'Anti-gaspillage : vendez vos surplus à prix réduit entre confrères de votre région.' },
      'sidebar-sos': { icon: '🆘', title: 'SOS Stock', description: 'Besoin urgent de matériel ? Publiez une alerte, les confrères proches vous dépannent.' },
      'btn-commander': { icon: '🛒', title: 'Commander via JADOMI', description: 'Lancez une commande optimisée. JADOMI trouve le meilleur fournisseur au meilleur prix.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Offres fournisseurs, campagnes groupées, alertes stock. Tout ici.' }
    }
  },

  orthodontiste: {
    titre: 'Docteur',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet d\'orthodontie connecté. JADOMI optimise le suivi de vos traitements, vos paiements échelonnés et votre relation patient.',
    features: [
      {
        icon: '📋',
        title: 'Suivi des traitements',
        description: 'Suivez chaque étape du traitement orthodontique : appareillage, ajustements, contention. Timeline visuelle.',
        cta: 'Voir mes traitements',
        route: '#traitements'
      },
      {
        icon: '💳',
        title: 'Paiements échelonnés',
        description: 'Configurez des échéanciers automatiques. Prélèvements, relances, suivi des impayées.',
        cta: 'Configurer',
        route: '#echeancier'
      },
      {
        icon: '👨‍👩‍👧',
        title: 'Portail famille',
        description: 'Les parents suivent le traitement de leur enfant en temps réel. RDV, photos, paiements.',
        cta: 'Activer le portail',
        route: '#portail-famille'
      },
      {
        icon: '🖼️',
        title: 'Imagerie 3D',
        description: 'Importez vos scans 3D, céphalométries et photos avant/après. Galerie patient sécurisée.',
        cta: 'Gérer l\'imagerie',
        route: '#imagerie'
      },
      {
        icon: '🔔',
        title: 'Notifications intelligentes',
        description: 'Rappels de RDV, alertes échéances, notifications de traitement automatiques par SMS et email.',
        cta: 'Configurer',
        route: '#notifications'
      },
      {
        icon: '🎬',
        title: 'Site vitrine cabinet',
        description: 'Présentez votre cabinet d\'orthodontie avec un site premium. Galerie avant/après, équipe, tarifs.',
        cta: 'Créer mon site',
        route: '/public/vitrines/mon-site-v2.html'
      }
    ],
    quickwins: [
      { label: 'Créez votre premier plan de traitement', action: 'create-treatment', route: '#traitements' },
      { label: 'Configurez vos échéanciers de paiement', action: 'setup-payment', route: '#echeancier' },
      { label: 'Activez le portail famille pour vos patients', action: 'activate-portal', route: '#portail-famille' }
    ],
    tooltips: {
      'sidebar-traitements': { icon: '📋', title: 'Traitements', description: 'Suivi complet de chaque traitement : étapes, photos, timeline.' },
      'sidebar-echeancier': { icon: '💳', title: 'Échéanciers', description: 'Paiements échelonnés. Prélèvements automatiques, relances.' },
      'sidebar-portail': { icon: '👨‍👩‍👧', title: 'Portail famille', description: 'Accès parent au suivi du traitement, RDV et paiements.' },
      'sidebar-imagerie': { icon: '🖼️', title: 'Imagerie 3D', description: 'Scans, céphalométries, galerie avant/après sécurisée.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Rappels RDV, alertes échéances, notifications traitement.' }
    }
  },

  paramedical: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet paramédical connecté. Gérez vos patients, votre agenda et votre facturation CPAM en toute simplicité.',
    features: [
      {
        icon: '📁',
        title: 'Dossiers patients',
        description: 'Dossiers patients complets avec historique, bilans, ordonnances et notes de séance. Secret médical garanti.',
        cta: 'Voir mes patients',
        route: '#patients'
      },
      {
        icon: '🏥',
        title: 'Codes CPAM & téléconsultation',
        description: 'Codification automatique des actes NGAP/CCAM. Téléservices intégrés pour les remboursements.',
        cta: 'Configurer',
        route: '#cpam'
      },
      {
        icon: '🔒',
        title: 'Secret médical',
        description: 'Chiffrement bout en bout, hébergement HDS, conformité RGPD santé. Vos données sont protégées.',
        cta: 'En savoir plus',
        route: '#securite'
      },
      {
        icon: '📅',
        title: 'Agenda multi-créneaux',
        description: 'Agenda par type de consultation, durées variables, créneaux récurrents. Synchronisation calendrier.',
        cta: 'Configurer mon agenda',
        route: '#agenda'
      },
      {
        icon: '📝',
        title: 'Ordonnances & bilans',
        description: 'Générez ordonnances et bilans types en quelques clics. Modèles personnalisables par spécialité.',
        cta: 'Créer un modèle',
        route: '#ordonnances'
      },
      {
        icon: '💰',
        title: 'Facturation & télétransmission',
        description: 'Facturez vos actes et télétransmettez à la CPAM. Suivi des paiements et relances.',
        cta: 'Facturer',
        route: '#compta'
      }
    ],
    quickwins: [
      { label: 'Ajoutez votre premier patient', action: 'add-patient', route: '#patients' },
      { label: 'Configurez vos créneaux de consultation', action: 'setup-agenda', route: '#agenda' },
      { label: 'Paramétrez vos codes CPAM', action: 'setup-cpam', route: '#cpam' }
    ],
    tooltips: {
      'sidebar-patients': { icon: '📁', title: 'Dossiers patients', description: 'Historique complet, bilans, ordonnances, notes de séance.' },
      'sidebar-agenda': { icon: '📅', title: 'Agenda', description: 'Multi-créneaux, durées variables, rappels automatiques.' },
      'sidebar-cpam': { icon: '🏥', title: 'CPAM & codification', description: 'Codes NGAP/CCAM automatiques. Télétransmission intégrée.' },
      'sidebar-ordonnances': { icon: '📝', title: 'Ordonnances', description: 'Modèles personnalisables. Génération en quelques clics.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouveaux RDV, rappels patients, alertes paiements.' }
    }
  },

  prothesiste: {
    titre: 'Bonjour',
    salutation: 'Ravi de vous accueillir dans JADOMI.',
    description: 'Votre laboratoire de prothèse dentaire numérique. Gérez vos commandes, devis et relation client.',
    features: [
      { icon: '📋', title: 'Devis & commandes', description: 'Recevez et gérez les commandes des cabinets dentaires.', cta: 'Voir les devis', route: '#rush' },
      { icon: '📦', title: 'Fichiers 3D', description: 'Téléchargez et envoyez vos fichiers STL/OBJ en toute sécurité.', cta: 'Gérer les fichiers', route: '#fichiers' },
      { icon: '💰', title: 'Facturation', description: 'Générez des factures pro, suivez les paiements.', cta: 'Configurer', route: '#compta' },
      { icon: '🎬', title: 'Site vitrine labo', description: 'Présentez votre laboratoire avec un site premium.', cta: 'Créer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '📊', title: 'Scoring qualité', description: 'Votre score qualité visible par les cabinets. Meilleur score = plus de commandes.', cta: 'Voir mon score', route: '#scoring' },
      { icon: '🚚', title: 'Transport intégré', description: 'Envoi et réception sécurisés avec suivi en temps réel.', cta: 'Voir les envois', route: '#transport' }
    ],
    quickwins: [
      { label: 'Complétez votre profil laboratoire', action: 'lab-setup', route: '#parametres' },
      { label: 'Uploadez votre premier fichier 3D', action: 'upload-3d', route: '#fichiers' },
      { label: 'Créez votre grille tarifaire', action: 'pricing-grid', route: '#tarifs' }
    ],
    tooltips: {
      'sidebar-rush': { icon: '📋', title: 'Commandes Rush', description: 'Commandes urgentes des cabinets. Délais courts, prix premium.' },
      'sidebar-fichiers': { icon: '📦', title: 'Fichiers 3D', description: 'Stockage sécurisé et chiffré de vos fichiers STL, OBJ, PLY.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouvelles commandes, messages cabinets, alertes délai.' }
    }
  },

  sci: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Gérez votre patrimoine immobilier. Suivi des loyers, quittances automatiques, déclarations fiscales.',
    features: [
      { icon: '🏠', title: 'Gestion des biens', description: 'Listez vos propriétés avec toutes les informations clés.', cta: 'Voir mes biens', route: '#biens' },
      { icon: '👥', title: 'Locataires', description: 'Gérez vos locataires, baux et états des lieux.', cta: 'Gérer', route: '#locataires' },
      { icon: '📄', title: 'Quittances auto', description: 'Générées et envoyées automatiquement chaque mois.', cta: 'Configurer', route: '#quittances' },
      { icon: '💰', title: 'Trésorerie', description: 'Suivi des loyers encaissés, charges, solde en temps réel.', cta: 'Voir', route: '#tresorerie' },
      { icon: '📊', title: 'Déclarations fiscales', description: 'Export pour votre déclaration 2044 ou IS.', cta: 'Préparer', route: '#fiscal' },
      { icon: '📧', title: 'Communication', description: 'Envoyez des courriers et emails à vos locataires en 1 clic.', cta: 'Envoyer', route: '#communication' }
    ],
    quickwins: [
      { label: 'Ajoutez votre premier bien immobilier', action: 'add-property', route: '#biens' },
      { label: 'Enregistrez votre premier locataire', action: 'add-tenant', route: '#locataires' },
      { label: 'Configurez la génération automatique de quittances', action: 'setup-receipts', route: '#quittances' }
    ],
    tooltips: {
      'sidebar-biens': { icon: '🏠', title: 'Biens', description: 'Vue d\'ensemble de votre patrimoine immobilier.' },
      'sidebar-locataires': { icon: '👥', title: 'Locataires', description: 'Gestion des baux, états des lieux, relances.' },
      'sidebar-quittances': { icon: '📄', title: 'Quittances', description: 'Générées automatiquement. Envoi par email ou courrier.' },
      'sidebar-tresorerie': { icon: '💰', title: 'Trésorerie', description: 'Loyers encaissés, charges, solde net. Export comptable.' }
    }
  },

  coiffeur: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre salon connecté. Prise de RDV en ligne, fidélisation client, site vitrine premium.',
    features: [
      { icon: '📅', title: 'Réservations en ligne', description: 'Vos clients réservent 24/7 depuis votre site. Rappels SMS/email.', cta: 'Configurer', route: '#reservations' },
      { icon: '🎬', title: 'Site vitrine salon', description: 'Présentez votre salon avec photos, tarifs, équipe.', cta: 'Créer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '💇', title: 'Catalogue prestations', description: 'Gérez vos prestations avec prix, durées, photos avant/après.', cta: 'Voir', route: '#prestations' },
      { icon: '⭐', title: 'Fidélisation', description: 'Programme de fidélité automatisé. Carte virtuelle, points, récompenses.', cta: 'Activer', route: '#fidelite' },
      { icon: '📊', title: 'Statistiques', description: 'Prestations les plus demandées, horaires de pointe, CA prévisionnel.', cta: 'Voir', route: '#stats' },
      { icon: '📧', title: 'Campagnes SMS/email', description: 'Envoyez des promotions ciblées à vos clients.', cta: 'Créer', route: '#mailing' }
    ],
    quickwins: [
      { label: 'Ajoutez vos prestations et tarifs', action: 'add-services', route: '#prestations' },
      { label: 'Configurez vos horaires d\'ouverture', action: 'setup-hours', route: '#parametres' },
      { label: 'Partagez votre lien de réservation', action: 'share-booking', route: '#reservations' }
    ],
    tooltips: {
      'sidebar-reservations': { icon: '📅', title: 'Réservations', description: 'Agenda en ligne. Vos clients réservent depuis votre site ou les réseaux.' },
      'sidebar-prestations': { icon: '💇', title: 'Prestations', description: 'Catalogue de vos services avec prix, durées et descriptions.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouvelles réservations, annulations, messages clients.' }
    }
  },

  btp: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre entreprise BTP digitalisée. Devis, chantiers, factures, site vitrine.',
    features: [
      { icon: '🚧', title: 'Gestion de chantiers', description: 'Planning, équipes, rapports d\'intervention, photos avant/après.', cta: 'Voir', route: '#chantiers' },
      { icon: '📋', title: 'Devis & factures BTP', description: 'Devis détaillés avec métrages, situations, TVA auto.', cta: 'Créer un devis', route: '#devis' },
      { icon: '📦', title: 'Stock matériaux', description: 'Inventaire par chantier, alertes seuils, affectation.', cta: 'Voir', route: '#stock' },
      { icon: '🎬', title: 'Site vitrine', description: 'Présentez vos réalisations, vos compétences, votre équipe.', cta: 'Créer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '📊', title: 'Rentabilité chantier', description: 'Marge par chantier, temps passé, coût matériaux.', cta: 'Analyser', route: '#analytics' },
      { icon: '📸', title: 'Scanner factures', description: 'Glissez vos factures, l\'IA extrait tout automatiquement.', cta: 'Scanner', route: '#scanner' }
    ],
    quickwins: [
      { label: 'Créez votre premier devis', action: 'create-quote', route: '#devis' },
      { label: 'Enregistrez votre premier chantier', action: 'create-site', route: '#chantiers' },
      { label: 'Complétez vos informations légales (décennale)', action: 'legal-setup', route: '#parametres' }
    ],
    tooltips: {
      'sidebar-chantiers': { icon: '🚧', title: 'Chantiers', description: 'Suivi de vos chantiers. Planning, équipes, avancements.' },
      'sidebar-devis': { icon: '📋', title: 'Devis & factures', description: 'Devis BTP détaillés. Conversion en facture en 1 clic.' },
      'sidebar-stock': { icon: '📦', title: 'Stock matériaux', description: 'Inventaire par chantier. Alertes de réapprovisionnement.' }
    }
  },

  default: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre espace professionnel est prêt. Explorez les outils mis à votre disposition.',
    features: [
      { icon: '🎬', title: 'Site vitrine', description: 'Créez votre site web professionnel en quelques minutes.', cta: 'Créer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '💰', title: 'Facturation', description: 'Devis, factures, suivi des paiements.', cta: 'Commencer', route: '#compta' },
      { icon: '📧', title: 'Mailing', description: 'Envoyez des newsletters et campagnes à vos clients.', cta: 'Créer', route: '#mailing' },
      { icon: '📊', title: 'Tableau de bord', description: 'Vue d\'ensemble de votre activité en temps réel.', cta: 'Voir', route: '#dashboard' }
    ],
    quickwins: [
      { label: 'Complétez votre profil société', action: 'company-setup', route: '#parametres' },
      { label: 'Créez votre site vitrine', action: 'create-site', route: '/public/vitrines/mon-site-v2.html' },
      { label: 'Envoyez votre première facture', action: 'first-invoice', route: '#compta' }
    ],
    tooltips: {
      'sidebar-site': { icon: '🎬', title: 'Mon site', description: 'Votre site professionnel en ligne.' },
      'sidebar-compta': { icon: '💰', title: 'Facturation', description: 'Devis, factures, paiements.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Alertes et messages importants.' }
    }
  }
};

// Mapping type structure → contexte
const TYPE_MAPPING = {
  'cabinet_dentaire': 'dentiste',
  'dentiste': 'dentiste',
  'juridique': 'avocat',
  'cabinet_avocat': 'avocat',
  'avocat': 'avocat',
  'prothesiste': 'prothesiste',
  'laboratoire_prothese': 'prothesiste',
  'sci': 'sci',
  'services': 'coiffeur',
  'coiffeur': 'coiffeur',
  'salon_coiffure': 'coiffeur',
  'institut_beaute': 'coiffeur',
  'orthodontiste': 'orthodontiste',
  'paramedical': 'paramedical',
  'kine': 'paramedical',
  'osteopathe': 'paramedical',
  'artisan_btp': 'btp',
  'btp': 'btp',
  'profession_liberale': 'default',
  'createur': 'default',
  'sas': 'default',
  'sarl': 'default',
  'eurl': 'default',
  'association': 'default'
};

function getProfessionContext(typeStructure, sousType) {
  // Priorité au sous-type (ex: avocat dans profession_liberale)
  if (sousType && TYPE_MAPPING[sousType]) {
    return CONTEXTS[TYPE_MAPPING[sousType]];
  }
  return CONTEXTS[TYPE_MAPPING[typeStructure]] || CONTEXTS.default;
}

module.exports = { CONTEXTS, getProfessionContext, TYPE_MAPPING };
