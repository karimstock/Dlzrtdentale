// =============================================
// JADOMI — Tour Guide Steps par profession
// Chaque metier a 10-15 etapes guidees couvrant
// tous les items sidebar disponibles
// =============================================

const TOUR_STEPS = {

  avocat: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre cabinet : dossiers actifs, rendez-vous de la semaine, chiffre d\'affaires mensuel.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Dossiers clients', description: 'Gerez tous vos dossiers par client, par affaire ou par juridiction. Classement intelligent et recherche instantanee.', icon: '📁', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda et rendez-vous', description: 'Planifiez vos consultations, audiences et reunions. Vos clients reservent en ligne 24/7 avec rappels automatiques.', icon: '📅', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="timeline"]', title: 'Espace client securise', description: 'Vos clients consultent l\'avancement de leur dossier, deposent des documents et echangent avec vous en toute confidentialite.', icon: '🔐', placement: 'right' },
    { target: '[onclick*="chatbot"], [data-coach-tip-id="sidebar-chatbot"]', title: 'Chatbot IA juridique', description: 'Un assistant IA forme au droit repond aux questions frequentes de vos clients et pre-qualifie les demandes.', icon: '🤖', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Facturation des honoraires', description: 'Generez des notes d\'honoraires conformes, suivez les paiements et gerez les echeanciers.', icon: '💰', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Suivi des encaissements, exports comptables, rapprochement bancaire. Tout pret pour votre expert-comptable.', icon: '📒', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine premium', description: 'Presentez votre cabinet, vos domaines d\'expertise et vos honoraires. Video hero, themes premium, mentions legales IA.', icon: '🌐', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing et campagnes', description: 'Envoyez des newsletters juridiques, des mises a jour reglementaires ou des voeux a vos clients.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics visiteurs', description: 'Mesurez le trafic de votre site, les sources de nouveaux clients et le taux de conversion des consultations.', icon: '📈', placement: 'right' },
    { target: '[onclick*="documents"], [onclick*="modeles"]', title: 'Documents et modeles', description: 'Bibliotheque de modeles de contrats, conclusions et courriers. Personnalisez et generez en quelques clics.', icon: '📄', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres du cabinet', description: 'Configurez vos horaires, vos collaborateurs, vos preferences de notification. Refaites ce tour a tout moment.', icon: '⚙️', placement: 'top' }
  ],

  dentiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard de votre cabinet', description: 'References en stock, alertes critiques, economies realisees via JADOMI. Tout votre cabinet en 1 ecran.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"]', title: 'Fichier patients', description: 'Dossiers medicaux complets, historique des soins, radiographies et notes cliniques. Conforme RGPD et secret medical.', icon: '🗂️', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock intelligent', description: 'Inventaire en temps reel avec alertes peremption, niveaux critiques et suggestions de commande par l\'IA.', icon: '📦', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: '3 modes de commande', description: 'Commande rapide, JADOMI optimisee (meilleur prix -15%) ou groupee avec d\'autres cabinets (-25%).', icon: '🛒', placement: 'right' },
    { target: '[onclick*="groupages"], [data-coach-tip-id="sidebar-groupes"]', title: 'Paniers groupes regionaux', description: 'Rejoignez d\'autres cabinets de votre region pour commander ensemble. Economies jusqu\'a -30%.', icon: '🤝', placement: 'right' },
    { target: '[onclick*="groupe"], [data-coach-tip-id="sidebar-scanner"]', title: 'Scanner factures IA', description: 'Glissez une facture fournisseur, l\'IA extrait les produits et met a jour votre stock automatiquement.', icon: '📸', placement: 'right' },
    { target: '[onclick*="green"], [data-coach-tip-id="sidebar-green"]', title: 'JADOMI Green', description: 'Identifiez les produits eco-responsables et suivez votre empreinte carbone. Engagez votre cabinet dans une demarche durable.', icon: '🌱', placement: 'right' },
    { target: '[onclick*="sos"], [onclick*="urgence"]', title: 'SOS Stock', description: 'Besoin urgent d\'un produit ? Trouvez un cabinet voisin qui peut vous depanner immediatement.', icon: '🚨', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Timeline patient', description: 'Suivez chaque patient photo apres photo. Slider avant/apres pour visualiser l\'evolution des traitements.', icon: '🕐', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine medical', description: 'Presentez votre cabinet, votre equipe et vos specialites. Conforme aux regles ordinales.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Suivi des charges, exports comptables et rapprochement bancaire automatise.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Analysez vos depenses fournisseurs, vos economies et le trafic de votre site vitrine.', icon: '📈', placement: 'right' },
    { target: '[onclick*="deals"]', title: 'Flash Deals', description: 'Offres exclusives a duree limitee negociees par JADOMI avec vos fournisseurs. Alertes en temps reel.', icon: '⚡', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez votre cabinet, vos fournisseurs preferes, vos seuils d\'alerte et vos preferences.', icon: '⚙️', placement: 'top' }
  ],

  orthodontiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard orthodontie', description: 'Patients actifs, traitements en cours, controles prevus cette semaine. Votre planning d\'un coup d\'oeil.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Suivi des traitements', description: 'Chaque patient avec son plan de traitement, ses etapes, sa duree estimee et son avancement en pourcentage.', icon: '🦷', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Paiements echelonnes', description: 'Gerez les echeanciers patients : prelevements automatiques, relances et suivi des impayes.', icon: '💳', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Timeline patient', description: 'Suivez chaque patient photo apres photo. Slider avant/apres spectaculaire pour montrer les progres.', icon: '🕐', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda specialise', description: 'Planifiez controles, poses d\'appareils et urgences. Creneaux adaptes a la duree de chaque acte.', icon: '📅', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="famille"]', title: 'Espace famille', description: 'Les parents suivent le traitement de leur enfant, consultent les photos et reglent les echeances en ligne.', icon: '👨‍👩‍👧', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie avant/apres', description: 'Portfolio anonymise de vos cas termines. Les patients potentiels visualisent vos transformations.', icon: '📷', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine', description: 'Presentez votre cabinet d\'orthodontie avec un site premium. Resultats, equipe et prise de RDV en ligne.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="imagerie"], [onclick*="3d"]', title: 'Imagerie 3D', description: 'Integrez vos scanners intra-oraux et visualisez les simulations de traitement avec vos patients.', icon: '🔬', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Suivi des honoraires, exports comptables et gestion de la TVA sur les dispositifs medicaux.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Taux de conversion des devis, duree moyenne des traitements et trafic de votre site vitrine.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos actes, vos tarifs, vos horaires et vos modeles de devis orthodontiques.', icon: '⚙️', placement: 'top' }
  ],

  prothesiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard laboratoire', description: 'Cas en cours, livraisons prevues, score qualite. Vue d\'ensemble de votre activite prothesiste.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Commandes et cas', description: 'Recevez les commandes des cabinets dentaires, gerez les etapes de fabrication et planifiez les livraisons.', icon: '📋', placement: 'right' },
    { target: '[onclick*="fichiers"], [onclick*="3d"], [data-coach-tip-id="sidebar-stock"]', title: 'Fichiers 3D securises', description: 'Telechargez et envoyez vos fichiers STL/OBJ en toute securite. Stockage chiffre et versionne.', icon: '📦', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Suivi fabrication photo', description: 'Documentez chaque etape de fabrication avec des photos. Portfolio automatique pour votre vitrine.', icon: '🕐', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="portail"]', title: 'Portail dentistes', description: 'Vos dentistes partenaires suivent l\'avancement de leurs cas, deposent des fichiers et communiquent avec vous.', icon: '🔗', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="tarifs"]', title: 'Tarification', description: 'Grille tarifaire personnalisable par type de prothese, materiau et dentiste. Devis automatiques.', icon: '💰', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine laboratoire', description: 'Presentez votre savoir-faire, vos equipements et vos specialites aux chirurgiens-dentistes.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Suivi du CA par dentiste, gestion des factures et exports comptables mensuels.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Delais moyens de fabrication, taux de retouche, CA par categorie de prothese.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos materiaux, vos delais standards, vos dentistes partenaires et vos preferences.', icon: '⚙️', placement: 'top' }
  ],

  paramedical: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard cabinet', description: 'Patients actifs, seances prevues, chiffre d\'affaires. Vue synthetique de votre pratique.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Dossiers patients securises', description: 'Bilans, notes de seance, ordonnances. Chiffrement bout en bout, conforme au secret medical et RGPD.', icon: '🔐', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda multi-creneaux', description: 'Gerez cabinet, domicile et teleconsultation. Vos patients reservent en ligne avec rappels automatiques.', icon: '📅', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Cotations CPAM', description: 'Cotations integrees par specialite (kine, infirmier, orthophoniste). Facturation conforme en 1 clic.', icon: '💊', placement: 'right' },
    { target: '[onclick*="notes"], [onclick*="seances"]', title: 'Notes de seance', description: 'Redigez vos comptes-rendus de seance avec modeles pre-remplis adaptes a votre specialite.', icon: '📝', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="timeline"]', title: 'Espace patient', description: 'Vos patients consultent leurs documents, exercices a domicile et prochains rendez-vous en autonomie.', icon: '👤', placement: 'right' },
    { target: '[onclick*="ordonnances"], [onclick*="documents"]', title: 'Ordonnances', description: 'Gerez les ordonnances recues, suivez les seances prescrites et relancez pour renouvellement.', icon: '📄', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine', description: 'Presentez votre cabinet, vos specialites et vos horaires. Les patients vous trouvent et reservent en ligne.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Suivi des encaissements, retrocessions et exports pour votre declaration 2035.', icon: '📒', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos actes, tarifs conventionnes, horaires et preferences de notification.', icon: '⚙️', placement: 'top' }
  ],

  sci: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard patrimoine', description: 'Taux d\'occupation, loyers encaisses, tresorerie globale. Tout votre patrimoine immobilier en 1 ecran.', icon: '🏠', placement: 'bottom' },
    { target: '[onclick*="sci"], [onclick*="biens"], [data-coach-tip-id="sidebar-stock"]', title: 'Gestion des biens', description: 'Ajoutez vos proprietes avec surface, loyer, charges, photos et documents associes.', icon: '🏢', placement: 'right' },
    { target: '[onclick*="locataires"], [onclick*="dossiers"]', title: 'Locataires', description: 'Fiches locataires completes, historique des paiements, documents de bail et etats des lieux.', icon: '👥', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="quittances"], [data-coach-tip-id="sidebar-commandes"]', title: 'Quittances automatiques', description: 'Generees et envoyees automatiquement chaque mois par email. Vous n\'avez plus rien a faire.', icon: '📄', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="tresorerie"], [data-coach-tip-id="sidebar-compta"]', title: 'Tresorerie', description: 'Loyers encaisses, charges deductibles, solde net par bien et par SCI. Vision consolidee.', icon: '💰', placement: 'right' },
    { target: '[onclick*="fiscal"], [onclick*="declarations"]', title: 'Declarations fiscales', description: 'Pre-remplissage automatique de votre declaration 2044. Export PDF pret pour les impots.', icon: '📋', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Communication locataires', description: 'Envoyez des avis, des informations travaux ou des voeux a vos locataires en quelques clics.', icon: '📧', placement: 'right' },
    { target: '[onclick*="documents"], [onclick*="juridique"]', title: 'Documents juridiques', description: 'Modeles de bail, etats des lieux, lettres de relance. Generez vos documents conformes en 1 clic.', icon: '📑', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Rendement par bien, evolution de la valeur patrimoniale et analyse des charges.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos SCI, vos associes, vos comptes bancaires et vos preferences de notifications.', icon: '⚙️', placement: 'top' }
  ],

  coiffeur: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard salon', description: 'Reservations du jour, CA semaine, clients fideles. L\'essentiel de votre salon en 1 ecran.', icon: '💇', placement: 'bottom' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Reservations 24/7', description: 'Vos clients reservent en ligne a toute heure. Rappels SMS automatiques pour zero no-show.', icon: '📅', placement: 'right' },
    { target: '[onclick*="dossiers"], [onclick*="clients"], [data-coach-tip-id="sidebar-stock"]', title: 'Fiches clients', description: 'Historique des prestations, preferences couleur, allergies et notes personnelles pour chaque client.', icon: '👤', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock produits', description: 'Gerez vos produits de soin et de revente. Alertes de reapprovisionnement automatiques.', icon: '📦', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie de realisations', description: 'Publiez vos plus belles coupes et colorations. Galerie Instagram-like integree a votre site.', icon: '📷', placement: 'right' },
    { target: '[onclick*="fidelite"], [onclick*="programme"]', title: 'Programme fidelite', description: 'Points, recompenses et offres personnalisees pour fideliser vos clients reguliers.', icon: '⭐', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine salon', description: 'Presentez votre salon, votre equipe, vos tarifs et votre galerie. Reservation en ligne integree.', icon: '🌐', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing clients', description: 'Envoyez des promotions saisonnieres, des rappels coupe ou des offres anniversaire a vos clients.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Prestations populaires, horaires de pointe, CA par collaborateur. Pilotez votre salon avec les donnees.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos prestations, tarifs, horaires d\'ouverture et collaborateurs.', icon: '⚙️', placement: 'top' }
  ],

  btp: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard entreprise', description: 'Chantiers en cours, devis en attente, CA mensuel. Vue d\'ensemble de votre activite BTP.', icon: '🏗️', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="chantiers"], [data-coach-tip-id="sidebar-stock"]', title: 'Gestion des chantiers', description: 'Creez et suivez vos chantiers : planning, avancement, sous-traitants et documents associes.', icon: '📋', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Devis et factures BTP', description: 'Devis detailles avec metrages, factures de situation, acomptes et retenues de garantie.', icon: '📄', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock materiaux', description: 'Suivez vos materiaux par chantier. Alertes de reapprovisionnement et suivi des consommations.', icon: '📦', placement: 'right' },
    { target: '[onclick*="timeline"], [onclick*="photos"]', title: 'Photos avant/apres', description: 'Documentez chaque chantier etape par etape. Portfolio automatique pour votre site vitrine.', icon: '📷', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Vitrine realisations', description: 'Montrez vos chantiers termines avec photos avant/apres. Les clients decouvrent votre expertise.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite chantier', description: 'Rentabilite par chantier, gestion des acomptes, TVA autoliquidation et export comptable.', icon: '📒', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing clients', description: 'Envoyez vos realisations recentes, promotions saisonnieres ou voeux a vos clients et prospects.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Taux de conversion des devis, rentabilite par type de chantier et sources de nouveaux clients.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos corps de metier, tarifs horaires, modeles de devis et preferences.', icon: '⚙️', placement: 'top' }
  ],

  createur: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard atelier', description: 'Commandes en cours, stock creations, revenus du mois. Vue d\'ensemble de votre activite creatrice.', icon: '🎨', placement: 'bottom' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Portfolio et showroom', description: 'Presentez vos creations avec un site premium. Galerie filtrable par collection, fiches produit detaillees.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Boutique et commandes', description: 'Gerez vos ventes, expeditions et retours. Paiement en ligne integre avec suivi de livraison.', icon: '🛒', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock creations', description: 'Suivez vos pieces uniques et editions limitees. Alertes de stock bas et gestion des matieres premieres.', icon: '📦', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie', description: 'Mettez en scene vos creations avec des photos haute qualite. Classement par collection et saison.', icon: '📷', placement: 'right' },
    { target: '[onclick*="deals"], [onclick*="vitrine"]', title: 'Site vitrine createur', description: 'Un site a votre image : typographies, couleurs et mise en page qui refletent votre univers creatif.', icon: '✨', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilite', description: 'Factures automatiques, suivi du CA par collection et export comptable mensuel.', icon: '📒', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing', description: 'Annoncez vos nouvelles collections, ventes privees ou evenements a votre communaute.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Creations les plus vues, taux de conversion et provenance de vos acheteurs.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez vos collections, frais de port, moyens de paiement et preferences.', icon: '⚙️', placement: 'top' }
  ],

  default: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre activite. Les indicateurs cles sont ici.', icon: '📊', placement: 'bottom' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Votre site internet', description: 'Creez et personnalisez votre site professionnel. 12 themes premium disponibles.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Facturation', description: 'Devis, factures, suivi des paiements. Tout automatise et conforme.', icon: '💰', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing', description: 'Envoyez des newsletters et campagnes a vos clients en quelques clics.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Mesurez votre activite, le trafic de votre site et la satisfaction client.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Parametres', description: 'Configurez votre compte, vos preferences et vos notifications.', icon: '⚙️', placement: 'top' }
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
  // 1. Direct match on sousType
  if (sousType && TOUR_STEPS[sousType]) return TOUR_STEPS[sousType];
  // 2. Direct match on societeType (e.g. 'dentiste', 'avocat')
  if (societeType && TOUR_STEPS[societeType]) return TOUR_STEPS[societeType];
  // 3. Mapping lookup (e.g. 'cabinet_dentaire' → 'dentiste')
  const key = TOUR_TYPE_MAP[societeType];
  if (key && TOUR_STEPS[key]) return TOUR_STEPS[key];
  // 4. Fallback
  return TOUR_STEPS.default;
}

// Always expose on window when in browser
if (typeof window !== 'undefined') {
  window.TOUR_STEPS = TOUR_STEPS;
  window.JADOMI_TOUR_STEPS = TOUR_STEPS;
  window.JADOMI_TOUR_TYPE_MAP = TOUR_TYPE_MAP;
  window.getTourSteps = getTourSteps;
}

// CommonJS export for Node.js
try { if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOUR_STEPS, TOUR_TYPE_MAP, getTourSteps };
}} catch(e) {}
