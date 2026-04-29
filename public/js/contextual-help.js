// =============================================
// JADOMI — Contextual Help Widget
// In-page, context-aware help panel for all dashboard pages
// Include via <script src="/js/contextual-help.js" defer></script>
// =============================================
(function() {
  'use strict';

  // ---- Help content map ----
  var HELP_MAP = {
    stock: {
      title: 'Gestion du stock',
      tips: [
        'Utilisez le scanner de code-barres pour ajouter rapidement des produits \u00e0 votre inventaire.',
        'Configurez des alertes de stock bas pour ne jamais manquer de fournitures essentielles.',
        'Les commandes GPO vous permettent de b\u00e9n\u00e9ficier de tarifs n\u00e9goci\u00e9s avec vos confr\u00e8res.'
      ],
      faq: [
        { q: 'Comment ajouter un produit au stock ?', a: 'Cliquez sur "Ajouter un produit" dans le tableau de bord Stock. Renseignez la r\u00e9f\u00e9rence, le nom, la quantit\u00e9 et le fournisseur. Vous pouvez \u00e9galement scanner le code-barres du produit pour un ajout rapide.' },
        { q: 'Comment configurer une alerte de stock bas ?', a: 'Dans les param\u00e8tres de chaque produit, d\u00e9finissez un seuil minimum. Vous recevrez une notification par email lorsque la quantit\u00e9 passe en dessous de ce seuil.' },
        { q: 'Que signifie GPO ?', a: 'GPO (Group Purchasing Organization) regroupe vos achats avec d\'autres praticiens pour obtenir des tarifs n\u00e9goci\u00e9s aupr\u00e8s des fabricants. Rejoignez un panier ouvert depuis l\'onglet Commandes.' }
      ],
      articles: [
        { label: 'Comment scanner un produit ?', anchor: '#scanner' },
        { label: 'Configurer les alertes de stock', anchor: '#alertes-stock' },
        { label: 'Comprendre les commandes GPO', anchor: '#gpo' },
        { label: 'G\u00e9rer les fournisseurs', anchor: '#fournisseurs' }
      ],
      tutorials: [
        { label: 'Prise en main du tableau de bord stock', url: '/vitrines/aide.html#stock' },
        { label: 'Optimiser vos commandes group\u00e9es', url: '/vitrines/aide.html#gpo-guide' }
      ]
    },
    organisation: {
      title: 'Organisation',
      tips: [
        'Vous pouvez g\u00e9rer plusieurs soci\u00e9t\u00e9s depuis un seul compte gr\u00e2ce au s\u00e9lecteur en haut de page.',
        'La barre lat\u00e9rale vous donne acc\u00e8s \u00e0 tous les modules : facturation, documents, \u00e9quipe.',
        'Personnalisez vos param\u00e8tres de soci\u00e9t\u00e9 (logo, adresse, SIRET) dans l\'onglet Param\u00e8tres.'
      ],
      faq: [
        { q: 'Comment g\u00e9rer plusieurs soci\u00e9t\u00e9s ?', a: 'Utilisez le s\u00e9lecteur de soci\u00e9t\u00e9 en haut de page pour basculer entre vos diff\u00e9rentes structures. Chaque soci\u00e9t\u00e9 dispose de son propre espace de donn\u00e9es.' },
        { q: 'Comment inviter un collaborateur ?', a: 'Dans Param\u00e8tres > \u00c9quipe, cliquez sur "Inviter un collaborateur". Saisissez son adresse email et attribuez-lui un r\u00f4le (admin, praticien, assistant).' },
        { q: 'Comment modifier les informations de ma soci\u00e9t\u00e9 ?', a: 'Rendez-vous dans Param\u00e8tres > Informations soci\u00e9t\u00e9. Vous pourrez y modifier le logo, l\'adresse, le SIRET et les coordonn\u00e9es de contact.' }
      ],
      articles: [
        { label: 'G\u00e9rer plusieurs soci\u00e9t\u00e9s', anchor: '#multi-societes' },
        { label: 'Configurer votre profil soci\u00e9t\u00e9', anchor: '#profil-societe' },
        { label: 'Inviter des collaborateurs', anchor: '#collaborateurs' },
        { label: 'Comprendre les r\u00f4les et permissions', anchor: '#roles' }
      ],
      tutorials: [
        { label: 'Configuration initiale de votre espace', url: '/vitrines/aide.html#onboarding' },
        { label: 'Gestion multi-soci\u00e9t\u00e9s avanc\u00e9e', url: '/vitrines/aide.html#multi-societes-guide' }
      ]
    },
    commandes: {
      title: 'Commandes',
      tips: [
        'Les paniers group\u00e9s GPO vous font \u00e9conomiser jusqu\'\u00e0 30% sur vos achats.',
        'Suivez l\'\u00e9tat de chaque commande en temps r\u00e9el depuis cet onglet.',
        'Vous pouvez dupliquer une commande pr\u00e9c\u00e9dente pour gagner du temps.'
      ],
      faq: [
        { q: 'Comment cr\u00e9er une commande group\u00e9e ?', a: 'Depuis l\'onglet Commandes, cliquez sur "Nouveau panier GPO". S\u00e9lectionnez les produits souhait\u00e9s et invitez vos confr\u00e8res \u00e0 rejoindre le panier pour atteindre les paliers de r\u00e9duction.' },
        { q: 'Comment suivre ma commande ?', a: 'Chaque commande affiche un statut en temps r\u00e9el (en attente, valid\u00e9e, exp\u00e9di\u00e9e, livr\u00e9e). Vous recevez \u00e9galement des notifications par email \u00e0 chaque changement de statut.' },
        { q: 'Puis-je annuler une commande ?', a: 'Vous pouvez annuler une commande tant qu\'elle n\'a pas \u00e9t\u00e9 valid\u00e9e par le fournisseur. Cliquez sur la commande concern\u00e9e puis sur "Annuler".' }
      ],
      articles: [
        { label: 'Cr\u00e9er une commande GPO', anchor: '#creer-gpo' },
        { label: 'Suivre une commande', anchor: '#suivi-commande' },
        { label: 'Paniers group\u00e9s : comment \u00e7a marche ?', anchor: '#paniers-groupes' },
        { label: 'G\u00e9rer les livraisons', anchor: '#livraisons' }
      ],
      tutorials: [
        { label: 'Votre premi\u00e8re commande group\u00e9e', url: '/vitrines/aide.html#premiere-commande' }
      ]
    },
    'site-vitrine': {
      title: 'Site vitrine',
      tips: [
        'Choisissez parmi 3 formules de site vitrine adapt\u00e9es \u00e0 votre activit\u00e9.',
        'Le chatbot int\u00e9gr\u00e9 r\u00e9pond automatiquement aux questions de vos patients.',
        'Personnalisez les couleurs et le th\u00e8me pour correspondre \u00e0 votre identit\u00e9 visuelle.'
      ],
      faq: [
        { q: 'Quelle formule choisir pour mon site ?', a: 'La formule Essentiel convient pour une pr\u00e9sence en ligne simple. La formule Pro ajoute le chatbot et la prise de rendez-vous. La formule Premium inclut le r\u00e9f\u00e9rencement SEO avanc\u00e9 et un nom de domaine personnalis\u00e9.' },
        { q: 'Comment personnaliser mon site ?', a: 'Dans l\'\u00e9diteur de site, modifiez les couleurs, le logo, les textes et les images. Les modifications sont visibles en temps r\u00e9el dans l\'aper\u00e7u.' },
        { q: 'Comment activer le chatbot ?', a: 'Le chatbot est disponible avec les formules Pro et Premium. Activez-le dans les param\u00e8tres de votre site et configurez les r\u00e9ponses aux questions fr\u00e9quentes de vos patients.' }
      ],
      articles: [
        { label: 'Choisir votre formule de site', anchor: '#formules-site' },
        { label: 'Configurer le chatbot', anchor: '#chatbot' },
        { label: 'Personnaliser les th\u00e8mes', anchor: '#themes' },
        { label: 'Ajouter du contenu \u00e0 votre site', anchor: '#contenu-site' },
        { label: 'D\u00e9ployer votre site en ligne', anchor: '#deploiement' }
      ],
      tutorials: [
        { label: 'Cr\u00e9er votre site en 5 minutes', url: '/vitrines/aide.html#creer-site' },
        { label: 'Configurer votre nom de domaine', url: '/vitrines/aide.html#domaine' }
      ]
    },
    signature: {
      title: 'Signature \u00e9lectronique',
      tips: [
        'JADOMI Sign permet de faire signer vos documents en ligne, en toute conformit\u00e9.',
        'Vos signataires re\u00e7oivent un lien par email pour signer depuis n\'importe quel appareil.',
        'Chaque signature est horodat\u00e9e et archiv\u00e9e automatiquement.'
      ],
      faq: [
        { q: 'Les signatures \u00e9lectroniques ont-elles une valeur juridique ?', a: 'Oui. JADOMI Sign utilise un proc\u00e9d\u00e9 de signature \u00e9lectronique conforme au r\u00e8glement eIDAS. Chaque signature est horodat\u00e9e et accompagn\u00e9e d\'un certificat de preuve.' },
        { q: 'Comment envoyer un document \u00e0 signer ?', a: 'T\u00e9l\u00e9chargez votre document (PDF), ajoutez les signataires avec leur adresse email, placez les zones de signature, puis envoyez. Les signataires re\u00e7oivent un lien s\u00e9curis\u00e9.' },
        { q: 'Comment relancer un signataire ?', a: 'Dans le suivi des signatures, cliquez sur le bouton "Relancer" \u00e0 c\u00f4t\u00e9 du signataire concern\u00e9. Un nouvel email lui sera envoy\u00e9 avec le lien de signature.' }
      ],
      articles: [
        { label: 'Envoyer un document \u00e0 signer', anchor: '#envoyer-signature' },
        { label: 'Suivre l\'\u00e9tat des signatures', anchor: '#suivi-signatures' },
        { label: 'Valeur juridique des signatures', anchor: '#valeur-juridique' },
        { label: 'Relancer un signataire', anchor: '#relance' }
      ],
      tutorials: [
        { label: 'Votre premi\u00e8re signature \u00e9lectronique', url: '/vitrines/aide.html#premiere-signature' }
      ]
    },
    timeline: {
      title: 'Timeline patient',
      tips: [
        'La timeline retrace l\'historique complet de chaque patient.',
        'Ajoutez des photos pour un suivi visuel pr\u00e9cis des traitements.',
        'Les \u00e9v\u00e9nements sont class\u00e9s chronologiquement et filtrables par type.'
      ],
      faq: [
        { q: 'Comment ajouter un \u00e9v\u00e9nement dans la timeline ?', a: 'Ouvrez la fiche du patient, acc\u00e9dez \u00e0 l\'onglet Timeline, puis cliquez sur "Ajouter un \u00e9v\u00e9nement". S\u00e9lectionnez le type (consultation, photo, document) et renseignez les d\u00e9tails.' },
        { q: 'Comment fonctionne le Triangle Photo ?', a: 'Le syst\u00e8me Triangle Photo permet au dentiste, au patient et au proth\u00e9siste de partager des photos en toute s\u00e9curit\u00e9. Chaque partie acc\u00e8de uniquement aux photos qui la concernent.' },
        { q: 'Comment partager un dossier avec un confr\u00e8re ?', a: 'Depuis la fiche patient, cliquez sur "Partager" et saisissez l\'adresse email du confr\u00e8re. Vous pouvez choisir les \u00e9l\u00e9ments \u00e0 partager et la dur\u00e9e d\'acc\u00e8s.' }
      ],
      articles: [
        { label: 'Consulter la timeline d\'un patient', anchor: '#consulter-timeline' },
        { label: 'Ajouter des photos et documents', anchor: '#photos-timeline' },
        { label: 'Partager un dossier avec un confr\u00e8re', anchor: '#partage-dossier' },
        { label: 'Syst\u00e8me Triangle Photo', anchor: '#triangle-photo' }
      ],
      tutorials: [
        { label: 'Utiliser le Triangle Photo', url: '/vitrines/aide.html#triangle-photo-guide' }
      ]
    },
    facturation: {
      title: 'Facturation',
      tips: [
        'G\u00e9n\u00e9rez des factures conformes Factur-X en un clic.',
        'Les devis peuvent \u00eatre convertis en factures automatiquement.',
        'Exportez vos donn\u00e9es comptables au format standard pour votre expert-comptable.'
      ],
      faq: [
        { q: 'Comment cr\u00e9er une facture Factur-X ?', a: 'Depuis le module Facturation, cliquez sur "Nouvelle facture". S\u00e9lectionnez le patient, ajoutez les actes r\u00e9alis\u00e9s et les montants. La facture est automatiquement g\u00e9n\u00e9r\u00e9e au format Factur-X conforme.' },
        { q: 'Comment convertir un devis en facture ?', a: 'Ouvrez le devis concern\u00e9 et cliquez sur "Convertir en facture". Toutes les informations du devis seront reprises automatiquement.' },
        { q: 'Comment exporter mes donn\u00e9es comptables ?', a: 'Dans le module Facturation, utilisez le bouton "Exporter". Choisissez le format (CSV ou FEC) et la p\u00e9riode souhait\u00e9e. Le fichier sera t\u00e9l\u00e9chargeable imm\u00e9diatement.' }
      ],
      articles: [
        { label: 'Cr\u00e9er une facture Factur-X', anchor: '#facturx' },
        { label: 'G\u00e9rer les devis', anchor: '#devis' },
        { label: 'Exporter pour la comptabilit\u00e9', anchor: '#export-compta' },
        { label: 'Suivi des paiements', anchor: '#paiements' }
      ],
      tutorials: [
        { label: 'Facturation de A \u00e0 Z', url: '/vitrines/aide.html#facturation-guide' }
      ]
    },
    prothesiste: {
      title: 'Espace proth\u00e9siste',
      tips: [
        'Suivez vos commandes de production en temps r\u00e9el depuis le tableau de bord.',
        'Le chat int\u00e9gr\u00e9 vous permet de communiquer directement avec le dentiste.',
        'Signalez un retard ou un probl\u00e8me via le syst\u00e8me de tickets int\u00e9gr\u00e9.'
      ],
      faq: [
        { q: 'Comment g\u00e9rer mes commandes de production ?', a: 'Le tableau de bord affiche toutes vos commandes en cours. Cliquez sur une commande pour voir les d\u00e9tails, les photos et les instructions du dentiste. Mettez \u00e0 jour le statut au fur et \u00e0 mesure de l\'avancement.' },
        { q: 'Comment communiquer avec le dentiste ?', a: 'Chaque commande dispose d\'un chat int\u00e9gr\u00e9. Cliquez sur l\'ic\u00f4ne de messagerie pour \u00e9changer directement avec le dentiste prescripteur.' },
        { q: 'Qu\'est-ce que le r\u00e9seau de solidarit\u00e9 ?', a: 'Le r\u00e9seau de solidarit\u00e9 permet aux proth\u00e9sistes de s\'entraider en cas de surcharge. Vous pouvez proposer ou demander de l\'aide sur des commandes sp\u00e9cifiques.' }
      ],
      articles: [
        { label: 'G\u00e9rer les commandes de production', anchor: '#production' },
        { label: 'Chat avec le dentiste', anchor: '#chat-dentiste' },
        { label: 'R\u00e9seau de solidarit\u00e9 proth\u00e9siste', anchor: '#reseau-solidarite' },
        { label: 'Charte 100% France', anchor: '#charte-france' }
      ],
      tutorials: [
        { label: 'Prise en main de l\'espace proth\u00e9siste', url: '/vitrines/aide.html#prothesiste-guide' }
      ]
    },
    'rendez-vous': {
      title: 'Rendez-vous',
      tips: [
        'G\u00e9rez vos cr\u00e9neaux disponibles et laissez vos patients prendre rendez-vous en ligne.',
        'Les rappels automatiques r\u00e9duisent les rendez-vous manqu\u00e9s.',
        'Synchronisez votre agenda avec votre logiciel m\u00e9tier.'
      ],
      faq: [
        { q: 'Comment configurer mes cr\u00e9neaux de disponibilit\u00e9 ?', a: 'Dans le module Rendez-vous, acc\u00e9dez aux param\u00e8tres de votre agenda. D\u00e9finissez vos jours et horaires de consultation, la dur\u00e9e des cr\u00e9neaux et les pauses.' },
        { q: 'Comment fonctionnent les rappels automatiques ?', a: 'Les rappels sont envoy\u00e9s par email et/ou SMS \u00e0 vos patients 24h et 1h avant leur rendez-vous. Activez-les dans les param\u00e8tres du module Rendez-vous.' },
        { q: 'Comment activer la prise de rendez-vous en ligne ?', a: 'Activez l\'option dans les param\u00e8tres de votre agenda. Un lien de r\u00e9servation sera g\u00e9n\u00e9r\u00e9, que vous pourrez partager ou int\u00e9grer \u00e0 votre site vitrine.' }
      ],
      articles: [
        { label: 'Configurer les cr\u00e9neaux', anchor: '#creneaux' },
        { label: 'Rappels automatiques', anchor: '#rappels' },
        { label: 'Prise de rendez-vous en ligne', anchor: '#rdv-en-ligne' }
      ],
      tutorials: [
        { label: 'Configurer votre agenda en ligne', url: '/vitrines/aide.html#agenda-guide' }
      ]
    },
    parametres: {
      title: 'Param\u00e8tres',
      tips: [
        'Mettez \u00e0 jour vos informations de soci\u00e9t\u00e9 (logo, adresse, contacts).',
        'Configurez vos pr\u00e9f\u00e9rences de notifications et d\'emails.',
        'G\u00e9rez les acc\u00e8s de vos collaborateurs depuis cet espace.'
      ],
      faq: [
        { q: 'Comment modifier le logo de ma soci\u00e9t\u00e9 ?', a: 'Dans Param\u00e8tres > Informations soci\u00e9t\u00e9, cliquez sur le logo actuel pour le remplacer. Formats accept\u00e9s : PNG, JPG, SVG. Taille recommand\u00e9e : 200x200 pixels minimum.' },
        { q: 'Comment configurer les notifications ?', a: 'Dans Param\u00e8tres > Notifications, activez ou d\u00e9sactivez les notifications par cat\u00e9gorie : emails, alertes stock, rappels rendez-vous, mises \u00e0 jour de commandes.' },
        { q: 'Comment supprimer un collaborateur ?', a: 'Dans Param\u00e8tres > \u00c9quipe, cliquez sur le collaborateur concern\u00e9 puis sur "R\u00e9voquer l\'acc\u00e8s". Son acc\u00e8s sera imm\u00e9diatement d\u00e9sactiv\u00e9.' }
      ],
      articles: [
        { label: 'Modifier les informations soci\u00e9t\u00e9', anchor: '#infos-societe' },
        { label: 'Configurer les notifications', anchor: '#notifications' },
        { label: 'G\u00e9rer les collaborateurs', anchor: '#gestion-equipe' }
      ],
      tutorials: [
        { label: 'Param\u00e9trage complet de votre espace', url: '/vitrines/aide.html#parametres-guide' }
      ]
    },
    default: {
      title: 'Aide JADOMI',
      tips: [
        'Explorez le centre d\'aide complet pour trouver des r\u00e9ponses \u00e0 toutes vos questions.',
        'Utilisez la barre de recherche ci-dessous pour trouver rapidement un article.',
        'Vous pouvez cr\u00e9er un ticket de support si vous ne trouvez pas la r\u00e9ponse souhait\u00e9e.'
      ],
      faq: [
        { q: 'Comment d\u00e9marrer avec JADOMI ?', a: 'Apr\u00e8s votre inscription, configurez votre soci\u00e9t\u00e9 (logo, adresse, SIRET), invitez vos collaborateurs et explorez les modules disponibles depuis le tableau de bord.' },
        { q: 'Comment contacter le support ?', a: 'Cliquez sur le bouton "Cr\u00e9er un ticket de support" ci-dessous, ou rendez-vous sur la page Support depuis le menu principal. Notre \u00e9quipe vous r\u00e9pondra sous 24 heures.' },
        { q: 'Comment changer mon mot de passe ?', a: 'Rendez-vous dans Param\u00e8tres > Mon compte > S\u00e9curit\u00e9 et cliquez sur "Modifier le mot de passe". Un email de confirmation vous sera envoy\u00e9.' }
      ],
      articles: [
        { label: 'Guide de d\u00e9marrage rapide', anchor: '#demarrage' },
        { label: 'Questions fr\u00e9quentes', anchor: '#faq' },
        { label: 'Gestion de votre compte', anchor: '#compte' },
        { label: 'Facturation et abonnement', anchor: '#facturation-abo' }
      ],
      tutorials: [
        { label: 'D\u00e9couvrir JADOMI en 5 minutes', url: '/vitrines/aide.html#decouvrir' },
        { label: 'Centre d\'aide complet', url: '/vitrines/aide.html' }
      ]
    }
  };

  // ---- Context detection ----
  function detectContext() {
    var ctx = document.body.getAttribute('data-help-context');
    if (ctx && HELP_MAP[ctx]) return ctx;
    var main = document.querySelector('[data-help-context]');
    if (main) {
      ctx = main.getAttribute('data-help-context');
      if (ctx && HELP_MAP[ctx]) return ctx;
    }
    var path = window.location.pathname.toLowerCase();
    if (path.includes('organisation')) return 'organisation';
    if (path.includes('signature') || path.includes('sign')) return 'signature';
    if (path.includes('commande')) return 'commandes';
    if (path.includes('vitrine') || path.includes('mon-site') || path.includes('site-builder')) return 'site-vitrine';
    if (path.includes('timeline')) return 'timeline';
    if (path.includes('factur')) return 'facturation';
    if (path.includes('prothes')) return 'prothesiste';
    if (path.includes('rendez-vous')) return 'rendez-vous';
    if (path.includes('parametre')) return 'parametres';
    if (path.includes('stock') || path === '/' || path.includes('index')) return 'stock';
    return 'default';
  }

  // ---- CSS injection ----
  var WIDGET_CSS = '\
.ctx-help-fab{position:fixed;bottom:28px;right:28px;width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#c9a961,#e8c77b);color:#0a0a0f;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;text-decoration:none;box-shadow:0 8px 28px rgba(201,169,97,.3);z-index:9990;transition:all .4s cubic-bezier(.16,1,.3,1);cursor:pointer;border:none;outline:none;}\
.ctx-help-fab:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 40px rgba(201,169,97,.5);}\
.ctx-help-fab:focus-visible{outline:2px solid #c9a961;outline-offset:3px;}\
.ctx-help-fab svg{pointer-events:none;}\
.ctx-help-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10001;opacity:0;pointer-events:none;transition:opacity .3s ease;}\
.ctx-help-overlay.visible{opacity:1;pointer-events:auto;}\
.ctx-help-panel{position:fixed;top:0;right:-360px;width:350px;height:100vh;z-index:10002;display:flex;flex-direction:column;background:rgba(15,18,30,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-left:1px solid rgba(201,169,97,.15);box-shadow:-8px 0 40px rgba(0,0,0,.4);transition:right .3s cubic-bezier(.16,1,.3,1);overflow:hidden;}\
.ctx-help-panel.open{right:0;}\
.ctx-help-header{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 16px;border-bottom:1px solid rgba(201,169,97,.12);flex-shrink:0;}\
.ctx-help-header h2{font-size:17px;font-weight:700;color:#f1f5f9;letter-spacing:-.3px;}\
.ctx-help-close{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#94a3b8;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s ease;}\
.ctx-help-close:hover{background:rgba(255,255,255,.1);color:#f1f5f9;}\
.ctx-help-close:focus-visible{outline:2px solid #c9a961;outline-offset:2px;}\
.ctx-help-body{flex:1;overflow-y:auto;padding:16px 22px 22px;}\
.ctx-help-body::-webkit-scrollbar{width:4px;}\
.ctx-help-body::-webkit-scrollbar-thumb{background:rgba(201,169,97,.2);border-radius:2px;}\
.ctx-help-search{position:relative;margin-bottom:18px;flex-shrink:0;padding:0 22px 0;}\
.ctx-help-search input{width:100%;padding:10px 14px 10px 36px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#f1f5f9;font-size:13px;font-family:Inter,system-ui,sans-serif;outline:none;transition:all .25s ease;}\
.ctx-help-search input::placeholder{color:#64748b;}\
.ctx-help-search input:focus{border-color:rgba(201,169,97,.4);box-shadow:0 0 0 3px rgba(201,169,97,.08);}\
.ctx-help-search svg{position:absolute;left:36px;top:50%;transform:translateY(-50%);color:#64748b;pointer-events:none;}\
.ctx-help-section{margin-bottom:20px;}\
.ctx-help-section-title{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#c9a961;margin-bottom:10px;}\
.ctx-help-tip{padding:10px 12px;background:rgba(201,169,97,.06);border:1px solid rgba(201,169,97,.1);border-radius:10px;margin-bottom:8px;font-size:12.5px;line-height:1.55;color:#cbd5e1;transition:background .2s ease;}\
.ctx-help-tip:hover{background:rgba(201,169,97,.1);}\
.ctx-help-link{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;font-size:13px;color:#94a3b8;text-decoration:none;transition:all .2s ease;cursor:pointer;}\
.ctx-help-link:hover{background:rgba(201,169,97,.08);color:#f1f5f9;}\
.ctx-help-link svg{flex-shrink:0;color:#c9a961;}\
.ctx-help-link span{flex:1;}\
.ctx-help-link .arrow{color:#475569;margin-left:auto;}\
.ctx-help-support{margin-top:8px;}\
.ctx-help-support-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 16px;background:linear-gradient(135deg,rgba(201,169,97,.15),rgba(201,169,97,.08));border:1px solid rgba(201,169,97,.2);border-radius:10px;color:#e8c77b;font-size:13px;font-weight:600;cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);font-family:Inter,system-ui,sans-serif;}\
.ctx-help-support-btn:hover{background:linear-gradient(135deg,rgba(201,169,97,.25),rgba(201,169,97,.15));transform:translateY(-1px);box-shadow:0 4px 16px rgba(201,169,97,.15);}\
.ctx-help-support-btn:focus-visible{outline:2px solid #c9a961;outline-offset:2px;}\
.ctx-help-no-results{text-align:center;padding:20px 0;color:#64748b;font-size:13px;}\
.ctx-help-faq-item{margin-bottom:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;transition:border-color .2s ease;}\
.ctx-help-faq-item:hover{border-color:rgba(201,169,97,.15);}\
.ctx-help-faq-q{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;font-size:12.5px;font-weight:600;color:#94a3b8;background:rgba(255,255,255,.02);transition:all .2s ease;border:none;width:100%;text-align:left;font-family:Inter,system-ui,sans-serif;outline:none;}\
.ctx-help-faq-q:hover{color:#f1f5f9;background:rgba(201,169,97,.05);}\
.ctx-help-faq-q:focus-visible{outline:2px solid #c9a961;outline-offset:-2px;}\
.ctx-help-faq-q .faq-chevron{flex-shrink:0;transition:transform .25s cubic-bezier(.16,1,.3,1);color:#475569;}\
.ctx-help-faq-q.open .faq-chevron{transform:rotate(90deg);color:#c9a961;}\
.ctx-help-faq-q.open{color:#f1f5f9;}\
.ctx-help-faq-a{max-height:0;overflow:hidden;transition:max-height .35s cubic-bezier(.16,1,.3,1),padding .25s ease;}\
.ctx-help-faq-a.open{max-height:300px;padding:0 12px 12px;}\
.ctx-help-faq-a-inner{font-size:12px;line-height:1.6;color:#64748b;}\
@media(max-width:480px){.ctx-help-panel{width:100vw;right:-100vw;}.ctx-help-panel.open{right:0;}}';

  // ---- SVG icons ----
  var ICON_QUESTION = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEARCH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var ICON_ARTICLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICON_TUTORIAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  var ICON_ARROW = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var ICON_TICKET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
  var ICON_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';

  // ---- Build DOM ----
  function buildWidget() {
    if (document.querySelector('.ctx-help-fab')) return;

    var context = detectContext();
    var data = HELP_MAP[context] || HELP_MAP['default'];

    if (!document.getElementById('ctx-help-css')) {
      var style = document.createElement('style');
      style.id = 'ctx-help-css';
      style.textContent = WIDGET_CSS;
      document.head.appendChild(style);
    }

    var overlay = document.createElement('div');
    overlay.className = 'ctx-help-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    var fab = document.createElement('button');
    fab.className = 'ctx-help-fab';
    fab.setAttribute('aria-label', 'Aide contextuelle');
    fab.setAttribute('title', 'Aide contextuelle (F1)');
    fab.innerHTML = ICON_QUESTION;
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.className = 'ctx-help-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Aide contextuelle');
    panel.setAttribute('aria-hidden', 'true');

    var html = '';
    html += '<div class="ctx-help-header"><h2>' + escHtml(data.title) + '</h2><button class="ctx-help-close" aria-label="Fermer">' + ICON_CLOSE + '</button></div>';
    html += '<div class="ctx-help-search">' + ICON_SEARCH + '<input type="text" placeholder="Rechercher dans l\'aide..." aria-label="Rechercher dans l\'aide"></div>';
    html += '<div class="ctx-help-body">';

    // FAQ accordion section (Intercom-style inline answers)
    if (data.faq && data.faq.length > 0) {
      html += '<div class="ctx-help-section ctx-help-faq-section"><div class="ctx-help-section-title">Questions fr\u00e9quentes</div>';
      for (var f = 0; f < data.faq.length; f++) {
        var faqItem = data.faq[f];
        html += '<div class="ctx-help-faq-item" data-searchable="' + escAttr(faqItem.q + ' ' + faqItem.a) + '">';
        html += '<button class="ctx-help-faq-q" data-faq-idx="' + f + '" aria-expanded="false"><span class="faq-chevron">' + ICON_CHEVRON + '</span><span>' + escHtml(faqItem.q) + '</span></button>';
        html += '<div class="ctx-help-faq-a"><div class="ctx-help-faq-a-inner">' + escHtml(faqItem.a) + '</div></div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Tips
    html += '<div class="ctx-help-section ctx-help-tips-section"><div class="ctx-help-section-title">Astuces pour cette page</div>';
    for (var i = 0; i < data.tips.length; i++) {
      html += '<div class="ctx-help-tip" data-searchable="' + escAttr(data.tips[i]) + '">' + escHtml(data.tips[i]) + '</div>';
    }
    html += '</div>';
    // Articles
    html += '<div class="ctx-help-section ctx-help-articles-section"><div class="ctx-help-section-title">Articles associ\u00e9s</div>';
    for (var j = 0; j < data.articles.length; j++) {
      var a = data.articles[j];
      html += '<a class="ctx-help-link" href="/vitrines/aide.html' + escAttr(a.anchor) + '" data-searchable="' + escAttr(a.label) + '">' + ICON_ARTICLE + '<span>' + escHtml(a.label) + '</span><span class="arrow">' + ICON_ARROW + '</span></a>';
    }
    html += '</div>';
    // Tutorials
    html += '<div class="ctx-help-section ctx-help-tutorials-section"><div class="ctx-help-section-title">Tutoriels recommand\u00e9s</div>';
    for (var k = 0; k < data.tutorials.length; k++) {
      var t = data.tutorials[k];
      html += '<a class="ctx-help-link" href="' + escAttr(t.url) + '" data-searchable="' + escAttr(t.label) + '">' + ICON_TUTORIAL + '<span>' + escHtml(t.label) + '</span><span class="arrow">' + ICON_ARROW + '</span></a>';
    }
    html += '</div>';
    // Support
    html += '<div class="ctx-help-section ctx-help-support"><div class="ctx-help-section-title">Besoin d\'aide ?</div>';
    html += '<button class="ctx-help-support-btn" data-action="support">' + ICON_TICKET + ' Cr\u00e9er un ticket de support</button>';
    html += '</div>';
    html += '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);

    // FAQ accordion toggle
    var faqButtons = panel.querySelectorAll('.ctx-help-faq-q');
    for (var fb = 0; fb < faqButtons.length; fb++) {
      faqButtons[fb].addEventListener('click', function() {
        var isOpenFaq = this.classList.contains('open');
        var answerEl = this.nextElementSibling;
        if (isOpenFaq) {
          this.classList.remove('open');
          this.setAttribute('aria-expanded', 'false');
          answerEl.classList.remove('open');
        } else {
          this.classList.add('open');
          this.setAttribute('aria-expanded', 'true');
          answerEl.classList.add('open');
        }
      });
    }

    var isOpen = false;
    var DISMISSED_KEY = 'ctx-help-dismissed';

    function openPanel() {
      isOpen = true;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      overlay.classList.add('visible');
      sessionStorage.removeItem(DISMISSED_KEY);
      var searchInput = panel.querySelector('.ctx-help-search input');
      if (searchInput) {
        setTimeout(function() { searchInput.focus(); }, 350);
      }
    }

    function closePanel() {
      isOpen = false;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('visible');
      sessionStorage.setItem(DISMISSED_KEY, '1');
      fab.focus();
    }

    function togglePanel() {
      if (isOpen) closePanel();
      else openPanel();
    }

    fab.addEventListener('click', togglePanel);
    overlay.addEventListener('click', closePanel);
    panel.querySelector('.ctx-help-close').addEventListener('click', closePanel);

    var supportBtn = panel.querySelector('[data-action="support"]');
    if (supportBtn) {
      supportBtn.addEventListener('click', function() {
        window.location.href = '/support';
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closePanel();
      }
      if (e.key === 'F1') {
        e.preventDefault();
        togglePanel();
      }
      if (e.key === 'Tab' && isOpen) {
        var focusable = panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });

    var searchInput = panel.querySelector('.ctx-help-search input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var query = this.value.toLowerCase().trim();
        var items = panel.querySelectorAll('[data-searchable]');
        var visibleCount = 0;
        for (var m = 0; m < items.length; m++) {
          var text = (items[m].getAttribute('data-searchable') || '').toLowerCase();
          var match = !query || text.indexOf(query) !== -1;
          items[m].style.display = match ? '' : 'none';
          if (match) visibleCount++;
        }
        var sections = panel.querySelectorAll('.ctx-help-section');
        for (var n = 0; n < sections.length; n++) {
          var sec = sections[n];
          if (sec.classList.contains('ctx-help-support')) continue;
          var visibleItems = sec.querySelectorAll('[data-searchable]');
          var hasVisible = false;
          for (var p = 0; p < visibleItems.length; p++) {
            if (visibleItems[p].style.display !== 'none') { hasVisible = true; break; }
          }
          sec.style.display = hasVisible ? '' : 'none';
        }
        var noResults = panel.querySelector('.ctx-help-no-results');
        if (query && visibleCount === 0) {
          if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'ctx-help-no-results';
            noResults.textContent = 'Aucun r\u00e9sultat pour cette recherche.';
            var body = panel.querySelector('.ctx-help-body');
            body.insertBefore(noResults, body.firstChild);
          }
          noResults.style.display = '';
        } else if (noResults) {
          noResults.style.display = 'none';
        }
      });
    }
  }

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) {
    return escHtml(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
