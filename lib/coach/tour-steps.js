// =============================================
// JADOMI — Tour Guide Steps par profession
// Chaque métier a 10-15 étapes guidées couvrant
// tous les items sidebar disponibles
// =============================================

const TOUR_STEPS = {

  avocat: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre cabinet : dossiers actifs, rendez-vous de la semaine, chiffre d\'affaires mensuel.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Dossiers clients', description: 'Gérez tous vos dossiers par client, par affaire ou par juridiction. Classement intelligent et recherche instantanée.', icon: '📁', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda et rendez-vous', description: 'Planifiez vos consultations, audiences et réunions. Vos clients réservent en ligne 24/7 avec rappels automatiques.', icon: '📅', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="timeline"]', title: 'Espace client sécurisé', description: 'Vos clients consultent l\'avancement de leur dossier, déposent des documents et échangent avec vous en toute confidentialité.', icon: '🔐', placement: 'right' },
    { target: '[onclick*="chatbot"], [data-coach-tip-id="sidebar-chatbot"]', title: 'Chatbot IA juridique', description: 'Un assistant IA formé au droit répond aux questions fréquentes de vos clients et pré-qualifie les demandes.', icon: '🤖', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Facturation des honoraires', description: 'Générez des notes d\'honoraires conformes, suivez les paiements et gérez les échéanciers.', icon: '💰', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Suivi des encaissements, exports comptables, rapprochement bancaire. Tout prêt pour votre expert-comptable.', icon: '📒', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine premium', description: 'Présentez votre cabinet, vos domaines d\'expertise et vos honoraires. Vidéo hero, thèmes premium, mentions légales IA.', icon: '🌐', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing et campagnes', description: 'Envoyez des newsletters juridiques, des mises à jour réglementaires ou des vœux à vos clients.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics visiteurs', description: 'Mesurez le trafic de votre site, les sources de nouveaux clients et le taux de conversion des consultations.', icon: '📈', placement: 'right' },
    { target: '[onclick*="documents"], [onclick*="modeles"]', title: 'Documents et modèles', description: 'Bibliothèque de modèles de contrats, conclusions et courriers. Personnalisez et générez en quelques clics.', icon: '📄', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres du cabinet', description: 'Configurez vos horaires, vos collaborateurs, vos préférences de notification. Refaites ce tour à tout moment.', icon: '⚙️', placement: 'top' }
  ],

  dentiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard de votre cabinet', description: 'Références en stock, alertes critiques, économies réalisées via JADOMI. Tout votre cabinet en 1 écran.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"]', title: 'Fichier patients', description: 'Dossiers médicaux complets, historique des soins, radiographies et notes cliniques. Conforme RGPD et secret médical.', icon: '🗂️', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock intelligent', description: 'Inventaire en temps réel avec alertes péremption, niveaux critiques et suggestions de commande par l\'IA.', icon: '📦', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: '3 modes de commande', description: 'Commande rapide, JADOMI optimisée (meilleur prix -15%) ou groupée avec d\'autres cabinets (-25%).', icon: '🛒', placement: 'right' },
    { target: '[onclick*="groupages"], [data-coach-tip-id="sidebar-groupes"]', title: 'Paniers groupés régionaux', description: 'Rejoignez d\'autres cabinets de votre région pour commander ensemble. Économies jusqu\'à -30%.', icon: '🤝', placement: 'right' },
    { target: '[onclick*="groupe"], [data-coach-tip-id="sidebar-scanner"]', title: 'Scanner factures IA', description: 'Glissez une facture fournisseur, l\'IA extrait les produits et met à jour votre stock automatiquement.', icon: '📸', placement: 'right' },
    { target: '[onclick*="green"], [data-coach-tip-id="sidebar-green"]', title: 'JADOMI Green', description: 'Identifiez les produits éco-responsables et suivez votre empreinte carbone. Engagez votre cabinet dans une démarche durable.', icon: '🌱', placement: 'right' },
    { target: '[onclick*="sos"], [onclick*="urgence"]', title: 'SOS Stock', description: 'Besoin urgent d\'un produit ? Trouvez un cabinet voisin qui peut vous dépanner immédiatement.', icon: '🚨', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Timeline patient', description: 'Suivez chaque patient photo après photo. Slider avant/après pour visualiser l\'évolution des traitements.', icon: '🕐', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine médical', description: 'Présentez votre cabinet, votre équipe et vos spécialités. Conforme aux règles ordinales.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Suivi des charges, exports comptables et rapprochement bancaire automatisé.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Analysez vos dépenses fournisseurs, vos économies et le trafic de votre site vitrine.', icon: '📈', placement: 'right' },
    { target: '[onclick*="deals"]', title: 'Flash Deals', description: 'Offres exclusives à durée limitée négociées par JADOMI avec vos fournisseurs. Alertes en temps réel.', icon: '⚡', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez votre cabinet, vos fournisseurs préférés, vos seuils d\'alerte et vos préférences.', icon: '⚙️', placement: 'top' }
  ],

  orthodontiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard orthodontie', description: 'Patients actifs, traitements en cours, contrôles prévus cette semaine. Votre planning d\'un coup d\'œil.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Suivi des traitements', description: 'Chaque patient avec son plan de traitement, ses étapes, sa durée estimée et son avancement en pourcentage.', icon: '🦷', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Paiements échelonnés', description: 'Gérez les échéanciers patients : prélèvements automatiques, relances et suivi des impayés.', icon: '💳', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Timeline patient', description: 'Suivez chaque patient photo après photo. Slider avant/après spectaculaire pour montrer les progrès.', icon: '🕐', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda spécialisé', description: 'Planifiez contrôles, poses d\'appareils et urgences. Créneaux adaptés à la durée de chaque acte.', icon: '📅', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="famille"]', title: 'Espace famille', description: 'Les parents suivent le traitement de leur enfant, consultent les photos et règlent les échéances en ligne.', icon: '👨‍👩‍👧', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie avant/après', description: 'Portfolio anonymisé de vos cas terminés. Les patients potentiels visualisent vos transformations.', icon: '📷', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine', description: 'Présentez votre cabinet d\'orthodontie avec un site premium. Résultats, équipe et prise de RDV en ligne.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="imagerie"], [onclick*="3d"]', title: 'Imagerie 3D', description: 'Intégrez vos scanners intra-oraux et visualisez les simulations de traitement avec vos patients.', icon: '🔬', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Suivi des honoraires, exports comptables et gestion de la TVA sur les dispositifs médicaux.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Taux de conversion des devis, durée moyenne des traitements et trafic de votre site vitrine.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos actes, vos tarifs, vos horaires et vos modèles de devis orthodontiques.', icon: '⚙️', placement: 'top' }
  ],

  prothesiste: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard laboratoire', description: 'Cas en cours, livraisons prévues, score qualité. Vue d\'ensemble de votre activité prothésiste.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Commandes et cas', description: 'Recevez les commandes des cabinets dentaires, gérez les étapes de fabrication et planifiez les livraisons.', icon: '📋', placement: 'right' },
    { target: '[onclick*="fichiers"], [onclick*="3d"], [data-coach-tip-id="sidebar-stock"]', title: 'Fichiers 3D sécurisés', description: 'Téléchargez et envoyez vos fichiers STL/OBJ en toute sécurité. Stockage chiffré et versionné.', icon: '📦', placement: 'right' },
    { target: '[onclick*="timeline"], [href*="timeline"]', title: 'Suivi fabrication photo', description: 'Documentez chaque étape de fabrication avec des photos. Portfolio automatique pour votre vitrine.', icon: '🕐', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="portail"]', title: 'Portail dentistes', description: 'Vos dentistes partenaires suivent l\'avancement de leurs cas, déposent des fichiers et communiquent avec vous.', icon: '🔗', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="tarifs"]', title: 'Tarification', description: 'Grille tarifaire personnalisable par type de prothèse, matériau et dentiste. Devis automatiques.', icon: '💰', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine laboratoire', description: 'Présentez votre savoir-faire, vos équipements et vos spécialités aux chirurgiens-dentistes.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Suivi du CA par dentiste, gestion des factures et exports comptables mensuels.', icon: '📒', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Délais moyens de fabrication, taux de retouche, CA par catégorie de prothèse.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos matériaux, vos délais standards, vos dentistes partenaires et vos préférences.', icon: '⚙️', placement: 'top' }
  ],

  paramedical: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard cabinet', description: 'Patients actifs, séances prévues, chiffre d\'affaires. Vue synthétique de votre pratique.', icon: '📊', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="patients"], [data-coach-tip-id="sidebar-stock"]', title: 'Dossiers patients sécurisés', description: 'Bilans, notes de séance, ordonnances. Chiffrement bout en bout, conforme au secret médical et RGPD.', icon: '🔐', placement: 'right' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Agenda multi-créneaux', description: 'Gérez cabinet, domicile et téléconsultation. Vos patients réservent en ligne avec rappels automatiques.', icon: '📅', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Cotations CPAM', description: 'Cotations intégrées par spécialité (kiné, infirmier, orthophoniste). Facturation conforme en 1 clic.', icon: '💊', placement: 'right' },
    { target: '[onclick*="notes"], [onclick*="seances"]', title: 'Notes de séance', description: 'Rédigez vos comptes-rendus de séance avec modèles pré-remplis adaptés à votre spécialité.', icon: '📝', placement: 'right' },
    { target: '[onclick*="espace-client"], [onclick*="timeline"]', title: 'Espace patient', description: 'Vos patients consultent leurs documents, exercices à domicile et prochains rendez-vous en autonomie.', icon: '👤', placement: 'right' },
    { target: '[onclick*="ordonnances"], [onclick*="documents"]', title: 'Ordonnances', description: 'Gérez les ordonnances reçues, suivez les séances prescrites et relancez pour renouvellement.', icon: '📄', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine', description: 'Présentez votre cabinet, vos spécialités et vos horaires. Les patients vous trouvent et réservent en ligne.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Suivi des encaissements, rétrocessions et exports pour votre déclaration 2035.', icon: '📒', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos actes, tarifs conventionnés, horaires et préférences de notification.', icon: '⚙️', placement: 'top' }
  ],

  sci: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard patrimoine', description: 'Taux d\'occupation, loyers encaissés, trésorerie globale. Tout votre patrimoine immobilier en 1 écran.', icon: '🏠', placement: 'bottom' },
    { target: '[onclick*="sci"], [onclick*="biens"], [data-coach-tip-id="sidebar-stock"]', title: 'Gestion des biens', description: 'Ajoutez vos propriétés avec surface, loyer, charges, photos et documents associés.', icon: '🏢', placement: 'right' },
    { target: '[onclick*="locataires"], [onclick*="dossiers"]', title: 'Locataires', description: 'Fiches locataires complètes, historique des paiements, documents de bail et états des lieux.', icon: '👥', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="quittances"], [data-coach-tip-id="sidebar-commandes"]', title: 'Quittances automatiques', description: 'Générées et envoyées automatiquement chaque mois par email. Vous n\'avez plus rien à faire.', icon: '📄', placement: 'right' },
    { target: '[onclick*="compta"], [onclick*="tresorerie"], [data-coach-tip-id="sidebar-compta"]', title: 'Trésorerie', description: 'Loyers encaissés, charges déductibles, solde net par bien et par SCI. Vision consolidée.', icon: '💰', placement: 'right' },
    { target: '[onclick*="fiscal"], [onclick*="declarations"]', title: 'Déclarations fiscales', description: 'Pré-remplissage automatique de votre déclaration 2044. Export PDF prêt pour les impôts.', icon: '📋', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Communication locataires', description: 'Envoyez des avis, des informations travaux ou des vœux à vos locataires en quelques clics.', icon: '📧', placement: 'right' },
    { target: '[onclick*="documents"], [onclick*="juridique"]', title: 'Documents juridiques', description: 'Modèles de bail, états des lieux, lettres de relance. Générez vos documents conformes en 1 clic.', icon: '📑', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Rendement par bien, évolution de la valeur patrimoniale et analyse des charges.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos SCI, vos associés, vos comptes bancaires et vos préférences de notifications.', icon: '⚙️', placement: 'top' }
  ],

  coiffeur: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard salon', description: 'Réservations du jour, CA semaine, clients fidèles. L\'essentiel de votre salon en 1 écran.', icon: '💇', placement: 'bottom' },
    { target: '[onclick*="reservations"], [onclick*="rdv"], [onclick*="agenda"]', title: 'Réservations 24/7', description: 'Vos clients réservent en ligne à toute heure. Rappels SMS automatiques pour zéro no-show.', icon: '📅', placement: 'right' },
    { target: '[onclick*="dossiers"], [onclick*="clients"], [data-coach-tip-id="sidebar-stock"]', title: 'Fiches clients', description: 'Historique des prestations, préférences couleur, allergies et notes personnelles pour chaque client.', icon: '👤', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock produits', description: 'Gérez vos produits de soin et de revente. Alertes de réapprovisionnement automatiques.', icon: '📦', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie de réalisations', description: 'Publiez vos plus belles coupes et colorations. Galerie Instagram-like intégrée à votre site.', icon: '📷', placement: 'right' },
    { target: '[onclick*="fidelite"], [onclick*="programme"]', title: 'Programme fidélité', description: 'Points, récompenses et offres personnalisées pour fidéliser vos clients réguliers.', icon: '⭐', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Site vitrine salon', description: 'Présentez votre salon, votre équipe, vos tarifs et votre galerie. Réservation en ligne intégrée.', icon: '🌐', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing clients', description: 'Envoyez des promotions saisonnières, des rappels coupe ou des offres anniversaire à vos clients.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Prestations populaires, horaires de pointe, CA par collaborateur. Pilotez votre salon avec les données.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos prestations, tarifs, horaires d\'ouverture et collaborateurs.', icon: '⚙️', placement: 'top' }
  ],

  btp: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard entreprise', description: 'Chantiers en cours, devis en attente, CA mensuel. Vue d\'ensemble de votre activité BTP.', icon: '🏗️', placement: 'bottom' },
    { target: '[onclick*="dossiers"], [onclick*="chantiers"], [data-coach-tip-id="sidebar-stock"]', title: 'Gestion des chantiers', description: 'Créez et suivez vos chantiers : planning, avancement, sous-traitants et documents associés.', icon: '📋', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Devis et factures BTP', description: 'Devis détaillés avec métrages, factures de situation, acomptes et retenues de garantie.', icon: '📄', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock matériaux', description: 'Suivez vos matériaux par chantier. Alertes de réapprovisionnement et suivi des consommations.', icon: '📦', placement: 'right' },
    { target: '[onclick*="timeline"], [onclick*="photos"]', title: 'Photos avant/après', description: 'Documentez chaque chantier étape par étape. Portfolio automatique pour votre site vitrine.', icon: '📷', placement: 'right' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Vitrine réalisations', description: 'Montrez vos chantiers terminés avec photos avant/après. Les clients découvrent votre expertise.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité chantier', description: 'Rentabilité par chantier, gestion des acomptes, TVA autoliquidation et export comptable.', icon: '📒', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing clients', description: 'Envoyez vos réalisations récentes, promotions saisonnières ou vœux à vos clients et prospects.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Taux de conversion des devis, rentabilité par type de chantier et sources de nouveaux clients.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos corps de métier, tarifs horaires, modèles de devis et préférences.', icon: '⚙️', placement: 'top' }
  ],

  createur: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Dashboard atelier', description: 'Commandes en cours, stock créations, revenus du mois. Vue d\'ensemble de votre activité créatrice.', icon: '🎨', placement: 'bottom' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Portfolio et showroom', description: 'Présentez vos créations avec un site premium. Galerie filtrable par collection, fiches produit détaillées.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="commandes"], [data-coach-tip-id="sidebar-commandes"]', title: 'Boutique et commandes', description: 'Gérez vos ventes, expéditions et retours. Paiement en ligne intégré avec suivi de livraison.', icon: '🛒', placement: 'right' },
    { target: '[onclick*="stock"], [data-coach-tip-id="sidebar-stock"]', title: 'Stock créations', description: 'Suivez vos pièces uniques et éditions limitées. Alertes de stock bas et gestion des matières premières.', icon: '📦', placement: 'right' },
    { target: '[onclick*="galerie"], [onclick*="portfolio"]', title: 'Galerie', description: 'Mettez en scène vos créations avec des photos haute qualité. Classement par collection et saison.', icon: '📷', placement: 'right' },
    { target: '[onclick*="deals"], [onclick*="vitrine"]', title: 'Site vitrine créateur', description: 'Un site à votre image : typographies, couleurs et mise en page qui reflètent votre univers créatif.', icon: '✨', placement: 'right' },
    { target: '[onclick*="compta"], [data-coach-tip-id="sidebar-compta"]', title: 'Comptabilité', description: 'Factures automatiques, suivi du CA par collection et export comptable mensuel.', icon: '📒', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing', description: 'Annoncez vos nouvelles collections, ventes privées ou événements à votre communauté.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Créations les plus vues, taux de conversion et provenance de vos acheteurs.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez vos collections, frais de port, moyens de paiement et préférences.', icon: '⚙️', placement: 'top' }
  ],

  default: [
    { target: '.nav-item.active, #dashboard-stats, .kpi-row', title: 'Votre tableau de bord', description: 'Vue d\'ensemble de votre activité. Les indicateurs clés sont ici.', icon: '📊', placement: 'bottom' },
    { target: '#nav-vitrines, [onclick*="mon-site"]', title: 'Votre site internet', description: 'Créez et personnalisez votre site professionnel. 12 thèmes premium disponibles.', icon: '🌐', placement: 'right' },
    { target: '[onclick*="devis"], [onclick*="compta"], [data-coach-tip-id="sidebar-commandes"]', title: 'Facturation', description: 'Devis, factures, suivi des paiements. Tout automatisé et conforme.', icon: '💰', placement: 'right' },
    { target: '#ms-nav-mailing, [onclick*="mailing"]', title: 'Mailing', description: 'Envoyez des newsletters et campagnes à vos clients en quelques clics.', icon: '📧', placement: 'right' },
    { target: '[onclick*="analytics"], [data-coach-tip-id="sidebar-analytics"]', title: 'Analytics', description: 'Mesurez votre activité, le trafic de votre site et la satisfaction client.', icon: '📈', placement: 'right' },
    { target: '.sidebar-bottom, .user-menu, [onclick*="param"]', title: 'Paramètres', description: 'Configurez votre compte, vos préférences et vos notifications.', icon: '⚙️', placement: 'top' }
  ]
};

// Mapping type société → clé tour
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
