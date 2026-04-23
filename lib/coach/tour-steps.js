// =============================================
// JADOMI — Tour Guide Steps par profession
// Chaque metier a 5-8 etapes guidees
// =============================================

const TOUR_STEPS = {

  avocat: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre cabinet : dossiers actifs, rendez-vous de la semaine, chiffre d\'affaires. Tout en un coup d\'oeil.', icon: '📊', placement: 'bottom' },
    { target: '#nav-vitrines, [onclick*="mon-site"], [href*="mon-site"]', title: 'Votre site vitrine premium', description: 'Personnalisez votre site professionnel avec video hero, themes premium, mentions legales generees par IA. Publiez en 1 clic.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [href*="compta"]', title: 'Facturation des honoraires', description: 'Generez des notes d\'honoraires conformes, suivez les paiements, exportez pour votre comptable. Tout est automatise.', icon: '💰', placement: 'right' },
    { target: '.topbar .notifications-btn, .notification-bell, [onclick*="notif"]', title: 'Notifications en temps reel', description: 'Nouveaux rendez-vous, messages clients, alertes importantes. Vous ne manquez rien, tout arrive ici.', icon: '🔔', placement: 'bottom' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres et personnalisation', description: 'Configurez votre cabinet, vos horaires, vos preferences. Vous pouvez refaire ce tour a tout moment depuis ici.', icon: '⚙️', placement: 'top' }
  ],

  dentiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard de votre cabinet', description: 'Vue d\'ensemble : references en stock, alertes critiques, economies realisees via JADOMI. Tout votre cabinet en 1 ecran.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock intelligent', description: 'Inventaire en temps reel avec alertes peremption, niveaux critiques et suggestions de commande par l\'IA. Fini les ruptures.', icon: '📦', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: '3 modes de commande', description: 'Commande rapide, JADOMI optimisee (meilleur prix garanti -15%), ou groupee avec d\'autres cabinets (-25%). A vous de choisir.', icon: '🛒', placement: 'right' },
    { target: '[onclick*="groupages"], [data-coach-tip-id="sidebar-groupes"]', title: 'Paniers groupes regionaux', description: 'Rejoignez d\'autres cabinets de votre region pour commander ensemble. 5 cabinets minimum, economies jusqu\'a -30%.', icon: '🤝', placement: 'right' },
    { target: '[onclick*="groupe"], [data-coach-tip-id="sidebar-scanner"]', title: 'Scanner factures IA', description: 'Glissez une facture fournisseur, l\'IA extrait les produits et met a jour votre stock automatiquement.', icon: '📸', placement: 'right' },
    { target: '.topbar .notifications-btn, .notification-bell', title: 'Vos notifications', description: 'Offres fournisseurs, campagnes groupees, alertes stock. Tout arrive ici en temps reel.', icon: '🔔', placement: 'bottom' }
  ],

  orthodontiste: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard orthodontie', description: 'Patients actifs, traitements en cours, controles prevus cette semaine. Votre planning d\'un coup d\'oeil.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'JADOMI Timeline', description: 'Suivez chaque patient photo apres photo. Slider avant/apres spectaculaire pour montrer les progres du traitement.', icon: '🕐', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="factures"]', title: 'Paiements echelonnes', description: 'Gerez les echeanciers de vos patients : prelevements automatiques, relances, suivi des impayes.', icon: '💳', placement: 'right' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Vitrine orthodontie', description: 'Montrez vos resultats avec un portfolio avant/apres anonymise. Les patients potentiels voient vos transformations.', icon: '🌐', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Alertes et rappels', description: 'Rappels de controle, alertes paiement, messages patients. Tout centralise ici.', icon: '🔔', placement: 'bottom' }
  ],

  prothesiste: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard laboratoire', description: 'Cas en cours, livraisons prevues, score qualite. Vue d\'ensemble de votre activite.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="rush"], [href*="rush"]', title: 'Commandes et cas', description: 'Recevez les commandes des cabinets, gerez les etapes de fabrication, envoyez les livraisons.', icon: '📋', placement: 'right' },
    { target: '[onclick*="fichiers"], [href*="fichiers"]', title: 'Fichiers 3D securises', description: 'Telechargez et envoyez vos fichiers STL/OBJ en toute securite. Stockage chiffre.', icon: '📦', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Suivi fabrication photo', description: 'Documentez chaque etape de fabrication avec des photos. Portfolio automatique pour votre vitrine.', icon: '🕐', placement: 'right' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Vitrine laboratoire', description: 'Presentez votre savoir-faire avec un site premium. Les chirurgiens-dentistes decouvrent votre expertise.', icon: '🌐', placement: 'right' }
  ],

  paramedical: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard cabinet', description: 'Patients actifs, seances prevues, chiffre d\'affaires. Vue synthetique de votre pratique.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"]', title: 'Dossiers patients securises', description: 'Conforme au secret medical. Bilans, notes de seance, cotations CPAM. Chiffrement bout en bout.', icon: '🔐', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="factures"]', title: 'Cotations et facturation', description: 'Cotations CPAM integrees par specialite. Generez vos factures conformes en 1 clic.', icon: '💊', placement: 'right' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Votre site professionnel', description: 'Presentez votre cabinet, vos specialites, vos horaires. Les patients trouvent et reservent en ligne.', icon: '🌐', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Alertes et messages', description: 'Rappels seances, messages patients, alertes agenda. Tout ici.', icon: '🔔', placement: 'bottom' }
  ],

  sci: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Vue patrimoine', description: 'Vos biens, le taux d\'occupation, les loyers encaisses, la tresorerie. Tout votre patrimoine en 1 ecran.', icon: '🏠', placement: 'bottom' },
    { target: '[onclick*="sci"], [onclick*="biens"]', title: 'Gestion des biens', description: 'Ajoutez vos proprietes avec toutes les informations : surface, loyer, charges, locataires, documents.', icon: '🏢', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="quittances"]', title: 'Quittances automatiques', description: 'Generees et envoyees automatiquement chaque mois. Vous n\'avez plus rien a faire.', icon: '📄', placement: 'right' },
    { target: '[onclick*="tresorerie"]', title: 'Suivi financier', description: 'Loyers encaisses, charges deductibles, solde net. Export pour votre declaration 2044.', icon: '💰', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Alertes locataires', description: 'Retards de loyer, fin de bail, relances automatiques. Tout centralise.', icon: '🔔', placement: 'bottom' }
  ],

  coiffeur: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard salon', description: 'Reservations du jour, CA semaine, clients fideles. L\'essentiel de votre salon en 1 ecran.', icon: '💇', placement: 'bottom' },
    { target: '[onclick*="reservations"], [onclick*="rdv"]', title: 'Reservations 24/7', description: 'Vos clients reservent en ligne a toute heure. Rappels SMS automatiques, zero no-show.', icon: '📅', placement: 'right' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Vitrine du salon', description: 'Montrez vos realisations, vos tarifs, votre equipe. Galerie Instagram-like integree.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="factures"]', title: 'Gestion et stats', description: 'Prestations les plus demandees, horaires de pointe, CA par collaborateur. Pilotez votre salon.', icon: '📊', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Nouvelles reservations', description: 'Reservations, annulations, messages clients. En temps reel.', icon: '🔔', placement: 'bottom' }
  ],

  btp: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard entreprise', description: 'Chantiers en cours, devis en attente, CA mensuel. Vue d\'ensemble de votre activite BTP.', icon: '🏗️', placement: 'bottom' },
    { target: '[onclick*="devis"], [onclick*="chantiers"]', title: 'Devis et chantiers', description: 'Creez des devis detailles avec metrages, generer des factures de situations. Suivi de chantier integre.', icon: '📋', placement: 'right' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Vitrine realisations', description: 'Montrez vos chantiers termines avec photos avant/apres. Les clients voient votre expertise.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"]', title: 'Comptabilite chantier', description: 'Rentabilite par chantier, gestion des acomptes, export comptable automatise.', icon: '💰', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Alertes chantier', description: 'Nouveaux devis, relances clients, alertes materiaux. Tout ici.', icon: '🔔', placement: 'bottom' }
  ],

  createur: [
    { target: '.nav-item.active, #dashboard-stats', title: 'Dashboard atelier', description: 'Commandes en cours, stock creations, revenus. Vue d\'ensemble de votre activite creatrice.', icon: '🎨', placement: 'bottom' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Portfolio en ligne', description: 'Presentez vos creations avec un site premium. Galerie filtrable, fiches produit, panier d\'achat.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="commandes"], [onclick*="commerce"]', title: 'Boutique et commandes', description: 'Gerez vos ventes, expeditions, retours. Paiement en ligne integre.', icon: '📦', placement: 'right' },
    { target: '[onclick*="compta"]', title: 'Facturation et suivi', description: 'Factures automatiques, suivi CA, export comptable. Concentrez-vous sur votre art.', icon: '💰', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Nouvelles commandes', description: 'Commandes, messages clients, alertes stock. En temps reel.', icon: '🔔', placement: 'bottom' }
  ],

  default: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre activite. Les indicateurs cles sont ici.', icon: '📊', placement: 'bottom' },
    { target: '#nav-vitrines, [href*="mon-site"]', title: 'Votre site internet', description: 'Creez et personnalisez votre site professionnel. 12 themes premium disponibles.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"]', title: 'Facturation', description: 'Devis, factures, suivi des paiements. Tout automatise.', icon: '💰', placement: 'right' },
    { target: '.topbar .notifications-btn', title: 'Notifications', description: 'Toutes vos alertes et messages importants ici.', icon: '🔔', placement: 'bottom' }
  ]
};

// Mapping type societe → cle tour
const TOUR_TYPE_MAP = {
  'cabinet_dentaire': 'dentiste',
  'juridique': 'avocat',
  'paramedical': 'paramedical',
  'services': 'coiffeur',
  'artisan_btp': 'btp',
  'createur': 'createur',
  'sci': 'sci',
  'orthodontiste': 'orthodontiste',
  'prothesiste': 'prothesiste'
};

function getTourSteps(societeType, sousType) {
  if (sousType && TOUR_STEPS[sousType]) return TOUR_STEPS[sousType];
  const key = TOUR_TYPE_MAP[societeType] || 'default';
  return TOUR_STEPS[key] || TOUR_STEPS.default;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOUR_STEPS, TOUR_TYPE_MAP, getTourSteps };
}
if (typeof window !== 'undefined') {
  window.JADOMI_TOUR_STEPS = TOUR_STEPS;
  window.JADOMI_TOUR_TYPE_MAP = TOUR_TYPE_MAP;
  window.getTourSteps = getTourSteps;
}
