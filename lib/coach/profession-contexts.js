// =============================================
// JADOMI — Coach JADOMI
// profession-contexts.js — Contextes par metier
// =============================================

const CONTEXTS = {

  avocat: {
    titre: 'Maitre',
    salutation: 'Ravi de vous accueillir dans JADOMI.',
    description: 'Votre cabinet juridique numerique est pret. JADOMI va vous aider a gerer vos dossiers, vos clients et votre visibilite en ligne.',
    features: [
      {
        icon: '🎬',
        title: 'Votre site vitrine',
        description: 'Presentez votre cabinet avec une video hero, vos expertises et votre equipe. Modifiable a tout moment.',
        cta: 'Voir mon site',
        route: '/public/vitrines/mon-site-v2.html'
      },
      {
        icon: '📅',
        title: 'Prise de RDV en ligne',
        description: 'Vos clients reservent directement un creneau. Confirmation email automatique.',
        cta: 'Configurer mes creneaux',
        route: '/public/vitrines/rendez-vous.html'
      },
      {
        icon: '🔐',
        title: 'Espace client securise',
        description: 'Partagez des documents confidentiels avec vos clients en toute securite.',
        cta: 'Activer',
        route: '/public/vitrines/espace-client.html'
      },
      {
        icon: '💬',
        title: 'Chatbot IA cabinet',
        description: 'Repond aux questions simples de vos visiteurs 24/7 et les oriente vers vous.',
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
        description: 'Generez vos notes d\'honoraires, suivez les paiements.',
        cta: 'Configurer',
        route: '#compta'
      }
    ],
    quickwins: [
      { label: 'Personnalisez votre site vitrine', action: 'edit-site', route: '/public/vitrines/mon-site-v2.html' },
      { label: 'Creez votre premier creneau de RDV', action: 'create-slot', route: '/public/vitrines/rendez-vous.html' },
      { label: 'Publiez votre premiere actualite', action: 'new-post', route: '#blog' }
    ],
    tooltips: {
      'sidebar-site': { icon: '🎬', title: 'Mon site internet', description: 'Gerez votre site vitrine premium : pages, contenu, theme, photos. Publiez en 1 clic.' },
      'sidebar-dossiers': { icon: '📁', title: 'Dossiers clients', description: 'Creez et suivez les dossiers de vos clients. Documents, messages, timeline.' },
      'sidebar-rdv': { icon: '📅', title: 'Agenda & RDV', description: 'Configurez vos creneaux de disponibilite. Vos clients reservent en ligne.' },
      'sidebar-compta': { icon: '💰', title: 'Honoraires & Facturation', description: 'Generez des notes d\'honoraires, suivez les paiements, exportez pour votre comptable.' },
      'sidebar-chatbot': { icon: '💬', title: 'Chatbot IA', description: 'Votre assistant virtuel repond aux visiteurs 24/7. Personnalisez les FAQ et le ton.' },
      'sidebar-analytics': { icon: '📊', title: 'Statistiques', description: 'Visiteurs, pages vues, expertises les plus consultees. Optimisez votre presence.' },
      'btn-publier': { icon: '🚀', title: 'Publier', description: 'Mettez votre site en ligne en 1 clic. Modifiable a tout moment apres publication.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouveaux RDV, messages clients, alertes importantes. Tout au meme endroit.' }
    }
  },

  dentiste: {
    titre: 'Docteur',
    metier_affichage: 'chirurgien-dentiste',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet dentaire connecte. JADOMI optimise votre stock, vos commandes et votre site web.',
    features: [
      {
        icon: '📦',
        title: 'Stock intelligent',
        description: 'Panier IA qui optimise vos commandes. Economies -15% garanties via GPO.',
        cta: 'Voir mon stock',
        route: '#stock'
      },
      {
        icon: '🛒',
        title: '3 modes de commande',
        description: 'Rapide classique, JADOMI optimisee (queue auction), ou groupee regionale.',
        cta: 'Commander',
        route: '#commandes'
      },
      {
        icon: '🤝',
        title: 'Paniers groupes',
        description: 'Rejoignez d\'autres cabinets pour economiser jusqu\'a -25%.',
        cta: 'Voir les campagnes',
        route: '#paniers-groupes'
      },
      {
        icon: '📸',
        title: 'Scanner factures IA',
        description: 'Glissez une facture, l\'IA ajoute les produits a votre stock.',
        cta: 'Scanner',
        route: '#scanner'
      },
      {
        icon: '🌱',
        title: 'JADOMI Green',
        description: 'Vendez vos surplus de stock a prix reduit entre confreres.',
        cta: 'Mettre en vente',
        route: '#green'
      },
      {
        icon: '🆘',
        title: 'SOS Stock',
        description: 'Urgence de materiel ? Les confreres de votre region peuvent depanner.',
        cta: 'Activer',
        route: '#sos'
      }
    ],
    quickwins: [
      { label: 'Scannez votre derniere facture fournisseur', action: 'scan-invoice', route: '#scanner' },
      { label: 'Creez votre premier panier intelligent', action: 'create-cart', route: '#panier' },
      { label: 'Configurez votre cabinet (adresse, horaires)', action: 'cabinet-setup', route: '#parametres' }
    ],
    tooltips: {
      'sidebar-stock': { icon: '📦', title: 'Stock intelligent', description: 'Vue complete de votre inventaire. Alertes peremption, niveaux critiques, suggestions de commande IA.' },
      'sidebar-commandes': { icon: '🛒', title: 'Commandes', description: '3 modes de commande : rapide, optimise GPO, ou groupee regionale. Economies garanties.' },
      'sidebar-groupes': { icon: '🤝', title: 'Paniers groupes', description: 'Campagnes de groupage 48h. 5 cabinets minimum. Economies -15% a -30%.' },
      'sidebar-scanner': { icon: '📸', title: 'Scanner IA', description: 'Glissez une facture PDF ou photo. L\'IA extrait les produits et met a jour votre stock.' },
      'sidebar-green': { icon: '🌱', title: 'JADOMI Green', description: 'Anti-gaspillage : vendez vos surplus a prix reduit entre confreres de votre region.' },
      'sidebar-sos': { icon: '🆘', title: 'SOS Stock', description: 'Besoin urgent de materiel ? Publiez une alerte, les confreres proches vous depannent.' },
      'btn-commander': { icon: '🛒', title: 'Commander via JADOMI', description: 'Lancez une commande optimisee. JADOMI trouve le meilleur fournisseur au meilleur prix.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Offres fournisseurs, campagnes groupees, alertes stock. Tout ici.' }
    }
  },

  orthodontiste: {
    titre: 'Docteur',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet d\'orthodontie connecte. JADOMI optimise le suivi de vos traitements, vos paiements echelonnes et votre relation patient.',
    features: [
      {
        icon: '📋',
        title: 'Suivi des traitements',
        description: 'Suivez chaque etape du traitement orthodontique : appareillage, ajustements, contention. Timeline visuelle.',
        cta: 'Voir mes traitements',
        route: '#traitements'
      },
      {
        icon: '💳',
        title: 'Paiements echelonnes',
        description: 'Configurez des echeanciers automatiques. Prelevements, relances, suivi des impayees.',
        cta: 'Configurer',
        route: '#echeancier'
      },
      {
        icon: '👨‍👩‍👧',
        title: 'Portail famille',
        description: 'Les parents suivent le traitement de leur enfant en temps reel. RDV, photos, paiements.',
        cta: 'Activer le portail',
        route: '#portail-famille'
      },
      {
        icon: '🖼️',
        title: 'Imagerie 3D',
        description: 'Importez vos scans 3D, cephalometries et photos avant/apres. Galerie patient securisee.',
        cta: 'Gerer l\'imagerie',
        route: '#imagerie'
      },
      {
        icon: '🔔',
        title: 'Notifications intelligentes',
        description: 'Rappels de RDV, alertes echeances, notifications de traitement automatiques par SMS et email.',
        cta: 'Configurer',
        route: '#notifications'
      },
      {
        icon: '🎬',
        title: 'Site vitrine cabinet',
        description: 'Presentez votre cabinet d\'orthodontie avec un site premium. Galerie avant/apres, equipe, tarifs.',
        cta: 'Creer mon site',
        route: '/public/vitrines/mon-site-v2.html'
      }
    ],
    quickwins: [
      { label: 'Creez votre premier plan de traitement', action: 'create-treatment', route: '#traitements' },
      { label: 'Configurez vos echeanciers de paiement', action: 'setup-payment', route: '#echeancier' },
      { label: 'Activez le portail famille pour vos patients', action: 'activate-portal', route: '#portail-famille' }
    ],
    tooltips: {
      'sidebar-traitements': { icon: '📋', title: 'Traitements', description: 'Suivi complet de chaque traitement : etapes, photos, timeline.' },
      'sidebar-echeancier': { icon: '💳', title: 'Echeanciers', description: 'Paiements echelonnes. Prelevements automatiques, relances.' },
      'sidebar-portail': { icon: '👨‍👩‍👧', title: 'Portail famille', description: 'Acces parent au suivi du traitement, RDV et paiements.' },
      'sidebar-imagerie': { icon: '🖼️', title: 'Imagerie 3D', description: 'Scans, cephalometries, galerie avant/apres securisee.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Rappels RDV, alertes echeances, notifications traitement.' }
    }
  },

  paramedical: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre cabinet paramedical connecte. Gerez vos patients, votre agenda et votre facturation CPAM en toute simplicite.',
    features: [
      {
        icon: '📁',
        title: 'Dossiers patients',
        description: 'Dossiers patients complets avec historique, bilans, ordonnances et notes de seance. Secret medical garanti.',
        cta: 'Voir mes patients',
        route: '#patients'
      },
      {
        icon: '🏥',
        title: 'Codes CPAM & teleconsultation',
        description: 'Codification automatique des actes NGAP/CCAM. Teleservices integres pour les remboursements.',
        cta: 'Configurer',
        route: '#cpam'
      },
      {
        icon: '🔒',
        title: 'Secret medical',
        description: 'Chiffrement bout en bout, hebergement HDS, conformite RGPD sante. Vos donnees sont protegees.',
        cta: 'En savoir plus',
        route: '#securite'
      },
      {
        icon: '📅',
        title: 'Agenda multi-creneaux',
        description: 'Agenda par type de consultation, durees variables, creneaux recurrents. Synchronisation calendrier.',
        cta: 'Configurer mon agenda',
        route: '#agenda'
      },
      {
        icon: '📝',
        title: 'Ordonnances & bilans',
        description: 'Generez ordonnances et bilans types en quelques clics. Modeles personnalisables par specialite.',
        cta: 'Creer un modele',
        route: '#ordonnances'
      },
      {
        icon: '💰',
        title: 'Facturation & teletransmission',
        description: 'Facturez vos actes et teletransmettez a la CPAM. Suivi des paiements et relances.',
        cta: 'Facturer',
        route: '#compta'
      }
    ],
    quickwins: [
      { label: 'Ajoutez votre premier patient', action: 'add-patient', route: '#patients' },
      { label: 'Configurez vos creneaux de consultation', action: 'setup-agenda', route: '#agenda' },
      { label: 'Parametrez vos codes CPAM', action: 'setup-cpam', route: '#cpam' }
    ],
    tooltips: {
      'sidebar-patients': { icon: '📁', title: 'Dossiers patients', description: 'Historique complet, bilans, ordonnances, notes de seance.' },
      'sidebar-agenda': { icon: '📅', title: 'Agenda', description: 'Multi-creneaux, durees variables, rappels automatiques.' },
      'sidebar-cpam': { icon: '🏥', title: 'CPAM & codification', description: 'Codes NGAP/CCAM automatiques. Teletransmission integree.' },
      'sidebar-ordonnances': { icon: '📝', title: 'Ordonnances', description: 'Modeles personnalisables. Generation en quelques clics.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouveaux RDV, rappels patients, alertes paiements.' }
    }
  },

  prothesiste: {
    titre: 'Bonjour',
    salutation: 'Ravi de vous accueillir dans JADOMI.',
    description: 'Votre laboratoire de prothese dentaire numerique. Gerez vos commandes, devis et relation client.',
    features: [
      { icon: '📋', title: 'Devis & commandes', description: 'Recevez et gerez les commandes des cabinets dentaires.', cta: 'Voir les devis', route: '#rush' },
      { icon: '📦', title: 'Fichiers 3D', description: 'Telechargez et envoyez vos fichiers STL/OBJ en toute securite.', cta: 'Gerer les fichiers', route: '#fichiers' },
      { icon: '💰', title: 'Facturation', description: 'Generez des factures pro, suivez les paiements.', cta: 'Configurer', route: '#compta' },
      { icon: '🎬', title: 'Site vitrine labo', description: 'Presentez votre laboratoire avec un site premium.', cta: 'Creer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '📊', title: 'Scoring qualite', description: 'Votre score qualite visible par les cabinets. Meilleur score = plus de commandes.', cta: 'Voir mon score', route: '#scoring' },
      { icon: '🚚', title: 'Transport integre', description: 'Envoi et reception securises avec suivi en temps reel.', cta: 'Voir les envois', route: '#transport' }
    ],
    quickwins: [
      { label: 'Completez votre profil laboratoire', action: 'lab-setup', route: '#parametres' },
      { label: 'Uploadez votre premier fichier 3D', action: 'upload-3d', route: '#fichiers' },
      { label: 'Creez votre grille tarifaire', action: 'pricing-grid', route: '#tarifs' }
    ],
    tooltips: {
      'sidebar-rush': { icon: '📋', title: 'Commandes Rush', description: 'Commandes urgentes des cabinets. Delais courts, prix premium.' },
      'sidebar-fichiers': { icon: '📦', title: 'Fichiers 3D', description: 'Stockage securise et chiffre de vos fichiers STL, OBJ, PLY.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouvelles commandes, messages cabinets, alertes delai.' }
    }
  },

  sci: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Gerez votre patrimoine immobilier. Suivi des loyers, quittances automatiques, declarations fiscales.',
    features: [
      { icon: '🏠', title: 'Gestion des biens', description: 'Listez vos proprietes avec toutes les informations cles.', cta: 'Voir mes biens', route: '#biens' },
      { icon: '👥', title: 'Locataires', description: 'Gerez vos locataires, baux et etats des lieux.', cta: 'Gerer', route: '#locataires' },
      { icon: '📄', title: 'Quittances auto', description: 'Generees et envoyees automatiquement chaque mois.', cta: 'Configurer', route: '#quittances' },
      { icon: '💰', title: 'Tresorerie', description: 'Suivi des loyers encaisses, charges, solde en temps reel.', cta: 'Voir', route: '#tresorerie' },
      { icon: '📊', title: 'Declarations fiscales', description: 'Export pour votre declaration 2044 ou IS.', cta: 'Preparer', route: '#fiscal' },
      { icon: '📧', title: 'Communication', description: 'Envoyez des courriers et emails a vos locataires en 1 clic.', cta: 'Envoyer', route: '#communication' }
    ],
    quickwins: [
      { label: 'Ajoutez votre premier bien immobilier', action: 'add-property', route: '#biens' },
      { label: 'Enregistrez votre premier locataire', action: 'add-tenant', route: '#locataires' },
      { label: 'Configurez la generation automatique de quittances', action: 'setup-receipts', route: '#quittances' }
    ],
    tooltips: {
      'sidebar-biens': { icon: '🏠', title: 'Biens', description: 'Vue d\'ensemble de votre patrimoine immobilier.' },
      'sidebar-locataires': { icon: '👥', title: 'Locataires', description: 'Gestion des baux, etats des lieux, relances.' },
      'sidebar-quittances': { icon: '📄', title: 'Quittances', description: 'Generees automatiquement. Envoi par email ou courrier.' },
      'sidebar-tresorerie': { icon: '💰', title: 'Tresorerie', description: 'Loyers encaisses, charges, solde net. Export comptable.' }
    }
  },

  coiffeur: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre salon connecte. Prise de RDV en ligne, fidelisation client, site vitrine premium.',
    features: [
      { icon: '📅', title: 'Reservations en ligne', description: 'Vos clients reservent 24/7 depuis votre site. Rappels SMS/email.', cta: 'Configurer', route: '#reservations' },
      { icon: '🎬', title: 'Site vitrine salon', description: 'Presentez votre salon avec photos, tarifs, equipe.', cta: 'Creer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '💇', title: 'Catalogue prestations', description: 'Gerez vos prestations avec prix, durees, photos avant/apres.', cta: 'Voir', route: '#prestations' },
      { icon: '⭐', title: 'Fidelisation', description: 'Programme de fidelite automatise. Carte virtuelle, points, recompenses.', cta: 'Activer', route: '#fidelite' },
      { icon: '📊', title: 'Statistiques', description: 'Prestations les plus demandees, horaires de pointe, CA previsionnel.', cta: 'Voir', route: '#stats' },
      { icon: '📧', title: 'Campagnes SMS/email', description: 'Envoyez des promotions ciblees a vos clients.', cta: 'Creer', route: '#mailing' }
    ],
    quickwins: [
      { label: 'Ajoutez vos prestations et tarifs', action: 'add-services', route: '#prestations' },
      { label: 'Configurez vos horaires d\'ouverture', action: 'setup-hours', route: '#parametres' },
      { label: 'Partagez votre lien de reservation', action: 'share-booking', route: '#reservations' }
    ],
    tooltips: {
      'sidebar-reservations': { icon: '📅', title: 'Reservations', description: 'Agenda en ligne. Vos clients reservent depuis votre site ou les reseaux.' },
      'sidebar-prestations': { icon: '💇', title: 'Prestations', description: 'Catalogue de vos services avec prix, durees et descriptions.' },
      'notifications': { icon: '🔔', title: 'Notifications', description: 'Nouvelles reservations, annulations, messages clients.' }
    }
  },

  btp: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre entreprise BTP digitalisee. Devis, chantiers, factures, site vitrine.',
    features: [
      { icon: '🚧', title: 'Gestion de chantiers', description: 'Planning, equipes, rapports d\'intervention, photos avant/apres.', cta: 'Voir', route: '#chantiers' },
      { icon: '📋', title: 'Devis & factures BTP', description: 'Devis detailles avec metrages, situations, TVA auto.', cta: 'Creer un devis', route: '#devis' },
      { icon: '📦', title: 'Stock materiaux', description: 'Inventaire par chantier, alertes seuils, affectation.', cta: 'Voir', route: '#stock' },
      { icon: '🎬', title: 'Site vitrine', description: 'Presentez vos realisations, vos competences, votre equipe.', cta: 'Creer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '📊', title: 'Rentabilite chantier', description: 'Marge par chantier, temps passe, cout materiaux.', cta: 'Analyser', route: '#analytics' },
      { icon: '📸', title: 'Scanner factures', description: 'Glissez vos factures, l\'IA extrait tout automatiquement.', cta: 'Scanner', route: '#scanner' }
    ],
    quickwins: [
      { label: 'Creez votre premier devis', action: 'create-quote', route: '#devis' },
      { label: 'Enregistrez votre premier chantier', action: 'create-site', route: '#chantiers' },
      { label: 'Completez vos informations legales (decennale)', action: 'legal-setup', route: '#parametres' }
    ],
    tooltips: {
      'sidebar-chantiers': { icon: '🚧', title: 'Chantiers', description: 'Suivi de vos chantiers. Planning, equipes, avancements.' },
      'sidebar-devis': { icon: '📋', title: 'Devis & factures', description: 'Devis BTP detailles. Conversion en facture en 1 clic.' },
      'sidebar-stock': { icon: '📦', title: 'Stock materiaux', description: 'Inventaire par chantier. Alertes de reapprovisionnement.' }
    }
  },

  default: {
    titre: 'Bonjour',
    salutation: 'Bienvenue dans JADOMI.',
    description: 'Votre espace professionnel est pret. Explorez les outils mis a votre disposition.',
    features: [
      { icon: '🎬', title: 'Site vitrine', description: 'Creez votre site web professionnel en quelques minutes.', cta: 'Creer mon site', route: '/public/vitrines/mon-site-v2.html' },
      { icon: '💰', title: 'Facturation', description: 'Devis, factures, suivi des paiements.', cta: 'Commencer', route: '#compta' },
      { icon: '📧', title: 'Mailing', description: 'Envoyez des newsletters et campagnes a vos clients.', cta: 'Creer', route: '#mailing' },
      { icon: '📊', title: 'Tableau de bord', description: 'Vue d\'ensemble de votre activite en temps reel.', cta: 'Voir', route: '#dashboard' }
    ],
    quickwins: [
      { label: 'Completez votre profil societe', action: 'company-setup', route: '#parametres' },
      { label: 'Creez votre site vitrine', action: 'create-site', route: '/public/vitrines/mon-site-v2.html' },
      { label: 'Envoyez votre premiere facture', action: 'first-invoice', route: '#compta' }
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
  // Priorite au sous-type (ex: avocat dans profession_liberale)
  if (sousType && TYPE_MAPPING[sousType]) {
    return CONTEXTS[TYPE_MAPPING[sousType]];
  }
  return CONTEXTS[TYPE_MAPPING[typeStructure]] || CONTEXTS.default;
}

module.exports = { CONTEXTS, getProfessionContext, TYPE_MAPPING };
