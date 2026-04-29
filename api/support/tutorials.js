// =============================================
// JADOMI — Tutoriels interactifs
// Routes /api/support/tutorials/*
// =============================================
const express = require('express');
const router = express.Router();

// Auth middleware (optional — progress tracking only)
let authSupabase = null;
let supabaseAdmin = null;
try {
  authSupabase = require('../multiSocietes/middleware').authSupabase;
} catch (e) {
  console.warn('[Tutorials] authSupabase indisponible:', e.message);
}

try {
  const { createClient } = require('@supabase/supabase-js');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (key && process.env.SUPABASE_URL) {
    supabaseAdmin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
} catch (e) {
  console.warn('[Tutorials] supabaseAdmin indisponible:', e.message);
}

// ── Tutorials data ──
const TUTORIALS = [
  // --- Premiers pas ---
  {
    slug: 'creer-votre-cabinet',
    title: 'Créer votre cabinet',
    description: 'Configurez votre structure en quelques minutes : informations légales, logo, coordonnées et paramètres de base.',
    category: 'Premiers pas',
    difficulty: 'débutant',
    duration_minutes: 4,
    video_url: null,
    steps: [
      { title: 'Inscription sur JADOMI', description: 'Rendez-vous sur jadomi.fr et cliquez sur Commencer gratuitement. Saisissez votre email professionnel et choisissez un mot de passe sécurisé.', image_hint: 'register-form' },
      { title: 'Choix de votre profession', description: 'Sélectionnez votre métier parmi les professions proposées (dentiste, avocat, BTP, etc.). JADOMI adaptera automatiquement votre espace.', image_hint: 'profession-select' },
      { title: 'Informations du cabinet', description: 'Renseignez le nom de votre structure, adresse, téléphone et numéro SIRET. Ces informations apparaîtront sur vos documents officiels.', image_hint: 'cabinet-form' },
      { title: 'Upload du logo', description: 'Importez le logo de votre cabinet au format PNG ou SVG. Il sera utilisé sur votre site vitrine, vos factures et vos emails.', image_hint: 'logo-upload' },
      { title: 'Validation et accès au tableau de bord', description: 'Confirmez vos informations et accédez à votre tableau de bord personnalisé. Votre espace est opérationnel.', image_hint: 'dashboard-welcome' }
    ]
  },
  {
    slug: 'configurer-tableau-de-bord',
    title: 'Configurer votre tableau de bord',
    description: 'Personnalisez les widgets, indicateurs et raccourcis de votre espace de travail quotidien.',
    category: 'Premiers pas',
    difficulty: 'débutant',
    duration_minutes: 3,
    video_url: null,
    steps: [
      { title: 'Accès aux paramètres du dashboard', description: 'Depuis votre tableau de bord, cliquez sur l\'icône Paramètres en haut à droite pour accéder aux options de personnalisation.', image_hint: 'dashboard-settings' },
      { title: 'Choix des widgets', description: 'Activez ou désactivez les widgets selon vos besoins : chiffre d\'affaires, rendez-vous du jour, alertes stock, messages patients.', image_hint: 'widget-toggle' },
      { title: 'Réorganisation par glisser-déposer', description: 'Maintenez un widget et déplacez-le pour réorganiser votre tableau de bord selon vos priorités quotidiennes.', image_hint: 'drag-drop' },
      { title: 'Configuration des KPI', description: 'Définissez vos objectifs mensuels pour chaque indicateur. Le tableau de bord affichera votre progression en temps réel.', image_hint: 'kpi-config' }
    ]
  },
  {
    slug: 'inviter-votre-equipe',
    title: 'Inviter votre équipe',
    description: 'Ajoutez vos collaborateurs avec des rôles et permissions adaptés à chaque poste.',
    category: 'Premiers pas',
    difficulty: 'débutant',
    duration_minutes: 3,
    video_url: null,
    steps: [
      { title: 'Ouvrir la gestion d\'équipe', description: 'Rendez-vous dans Paramètres puis Équipe pour accéder à la gestion des collaborateurs.', image_hint: 'team-settings' },
      { title: 'Ajouter un membre', description: 'Cliquez sur Inviter un collaborateur, saisissez son adresse email professionnelle et sélectionnez son rôle.', image_hint: 'invite-form' },
      { title: 'Attribution du rôle', description: 'Choisissez entre Administrateur (accès complet), Collaborateur (accès opérationnel) ou Lecteur (consultation uniquement).', image_hint: 'role-select' },
      { title: 'Envoi de l\'invitation', description: 'Le collaborateur reçoit un email avec un lien d\'activation sécurisé. Il pourra accéder à l\'espace en quelques clics.', image_hint: 'invite-sent' }
    ]
  },
  // --- Gestion stock ---
  {
    slug: 'scanner-une-facture',
    title: 'Scanner une facture',
    description: 'Numérisez et analysez automatiquement vos factures fournisseurs grâce à l\'IA JADOMI.',
    category: 'Gestion stock',
    difficulty: 'débutant',
    duration_minutes: 3,
    video_url: null,
    steps: [
      { title: 'Accéder au module factures', description: 'Depuis le menu latéral, cliquez sur Facturation puis Importer une facture pour accéder au scanner intelligent.', image_hint: 'facture-menu' },
      { title: 'Importer le document', description: 'Déposez votre facture au format PDF, JPEG ou PNG dans la zone d\'import. L\'IA analyse automatiquement le contenu.', image_hint: 'document-drop' },
      { title: 'Vérification des données extraites', description: 'Vérifiez les informations extraites : fournisseur, montants, références produits, dates. Corrigez si nécessaire.', image_hint: 'data-verify' },
      { title: 'Mise à jour automatique du stock', description: 'Validez pour mettre à jour automatiquement votre inventaire. Les quantités et les prix moyens sont recalculés.', image_hint: 'stock-update' }
    ]
  },
  {
    slug: 'alertes-peremption',
    title: 'Gérer les alertes péremption',
    description: 'Configurez des alertes automatiques pour les produits proches de leur date de péremption.',
    category: 'Gestion stock',
    difficulty: 'intermédiaire',
    duration_minutes: 4,
    video_url: null,
    steps: [
      { title: 'Ouvrir les paramètres stock', description: 'Allez dans Stock puis Paramètres pour accéder à la configuration des alertes de péremption.', image_hint: 'stock-settings' },
      { title: 'Définir les seuils d\'alerte', description: 'Configurez le nombre de jours avant péremption pour déclencher une alerte : 90 jours (orange), 30 jours (rouge).', image_hint: 'threshold-config' },
      { title: 'Choisir le mode de notification', description: 'Sélectionnez comment vous souhaitez être alerté : notification dans l\'application, email quotidien ou les deux.', image_hint: 'notif-mode' },
      { title: 'Consulter le tableau des alertes', description: 'Le tableau de bord affiche un widget dédié aux produits bientôt périmés, triés par urgence.', image_hint: 'alert-dashboard' }
    ]
  },
  {
    slug: 'commander-via-gpo',
    title: 'Commander via GPO',
    description: 'Profitez des tarifs négociés en passant vos commandes via le groupement d\'achats JADOMI.',
    category: 'Gestion stock',
    difficulty: 'intermédiaire',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Accéder au catalogue GPO', description: 'Depuis le menu Stock, cliquez sur Commandes groupées pour accéder au catalogue des offres négociées.', image_hint: 'gpo-catalog' },
      { title: 'Rechercher un produit', description: 'Utilisez la barre de recherche ou parcourez les catégories. Chaque produit affiche le prix public et le prix GPO négocié.', image_hint: 'gpo-search' },
      { title: 'Ajouter au panier groupé', description: 'Sélectionnez les quantités souhaitées et ajoutez au panier. Vous voyez en temps réel l\'économie réalisée.', image_hint: 'gpo-cart' },
      { title: 'Valider la commande', description: 'Confirmez votre commande. Elle rejoint le lot en cours. Plus il y a de participants, meilleur est le tarif.', image_hint: 'gpo-confirm' },
      { title: 'Suivi de la livraison', description: 'Suivez l\'état de votre commande groupée en temps réel : en cours de regroupement, commandée, expédiée, livrée.', image_hint: 'gpo-tracking' }
    ]
  },
  // --- Site vitrine ---
  {
    slug: 'creer-site-5-minutes',
    title: 'Créer votre site en 5 minutes',
    description: 'Lancez votre site vitrine professionnel en quelques clics avec les thèmes premium JADOMI.',
    category: 'Site vitrine',
    difficulty: 'débutant',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Lancer l\'assistant de création', description: 'Depuis votre tableau de bord, cliquez sur Site vitrine puis Créer mon site pour lancer l\'assistant guidé.', image_hint: 'site-wizard' },
      { title: 'Choisir un thème premium', description: 'Parcourez les thèmes adaptés à votre profession. Chaque thème est optimisé pour le référencement et le mobile.', image_hint: 'theme-gallery' },
      { title: 'Personnaliser le contenu', description: 'Remplacez les textes et images par les vôtres. L\'éditeur visuel vous montre le résultat en temps réel.', image_hint: 'content-editor' },
      { title: 'Configurer votre domaine', description: 'Utilisez le sous-domaine gratuit votrecabinet.jadomi.fr ou connectez votre propre nom de domaine.', image_hint: 'domain-setup' },
      { title: 'Publier en un clic', description: 'Cliquez sur Publier. Votre site est en ligne instantanément avec certificat SSL et optimisation SEO.', image_hint: 'publish-click' }
    ]
  },
  {
    slug: 'personnaliser-votre-theme',
    title: 'Personnaliser votre thème',
    description: 'Adaptez les couleurs, polices, sections et mise en page de votre site vitrine.',
    category: 'Site vitrine',
    difficulty: 'intermédiaire',
    duration_minutes: 6,
    video_url: null,
    steps: [
      { title: 'Accéder à l\'éditeur de thème', description: 'Depuis la gestion de votre site, cliquez sur Personnaliser pour ouvrir l\'éditeur visuel avancé.', image_hint: 'theme-editor' },
      { title: 'Modifier les couleurs', description: 'Ajustez la palette de couleurs : couleur principale, secondaire, arrière-plan et texte. L\'aperçu se met à jour en direct.', image_hint: 'color-picker' },
      { title: 'Gérer les sections', description: 'Ajoutez, supprimez ou réorganisez les sections : présentation, services, équipe, horaires, contact, témoignages.', image_hint: 'section-manager' },
      { title: 'Optimiser pour mobile', description: 'Basculez en aperçu mobile pour vérifier le rendu sur smartphone. Ajustez les tailles de texte et espacement si nécessaire.', image_hint: 'mobile-preview' }
    ]
  },
  // --- Patients ---
  {
    slug: 'timeline-avant-apres',
    title: 'Timeline avant/après',
    description: 'Documentez visuellement l\'évolution de vos traitements avec la timeline patient interactive.',
    category: 'Patients',
    difficulty: 'intermédiaire',
    duration_minutes: 4,
    video_url: null,
    steps: [
      { title: 'Ouvrir le dossier patient', description: 'Depuis la liste des patients, ouvrez le dossier concerné et cliquez sur l\'onglet Timeline.', image_hint: 'patient-file' },
      { title: 'Ajouter un événement', description: 'Cliquez sur Ajouter une étape. Choisissez le type : consultation, acte, photo, note, document.', image_hint: 'add-event' },
      { title: 'Importer des photos', description: 'Ajoutez des photos avant/après directement depuis votre appareil. L\'IA détecte et organise automatiquement.', image_hint: 'photo-import' },
      { title: 'Partager avec le patient', description: 'Activez le partage patient pour qu\'il puisse consulter sa timeline depuis son espace sécurisé.', image_hint: 'share-timeline' }
    ]
  },
  {
    slug: 'espace-client-securise',
    title: 'Espace client sécurisé',
    description: 'Offrez à vos patients un portail de suivi sécurisé avec documents, rendez-vous et messagerie.',
    category: 'Patients',
    difficulty: 'intermédiaire',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Activer l\'espace client', description: 'Dans Paramètres puis Espace client, activez le portail patient et personnalisez son apparence.', image_hint: 'portal-activate' },
      { title: 'Configurer les accès', description: 'Choisissez quelles informations sont visibles : documents, historique RDV, timeline, messagerie.', image_hint: 'access-config' },
      { title: 'Inviter un patient', description: 'Depuis le dossier patient, cliquez sur Inviter à l\'espace client. Le patient reçoit un email avec ses identifiants.', image_hint: 'patient-invite' },
      { title: 'Gérer les échanges', description: 'Consultez les messages patients depuis votre tableau de bord. Répondez de manière sécurisée et tracée.', image_hint: 'messages-manage' }
    ]
  },
  // --- Facturation ---
  {
    slug: 'generer-facture-facturx',
    title: 'Générer une facture Factur-X',
    description: 'Créez des factures conformes au standard Factur-X, obligatoire pour les marchés publics.',
    category: 'Facturation',
    difficulty: 'intermédiaire',
    duration_minutes: 4,
    video_url: null,
    steps: [
      { title: 'Créer une nouvelle facture', description: 'Depuis le module Facturation, cliquez sur Nouvelle facture. Sélectionnez le client parmi vos contacts.', image_hint: 'new-invoice' },
      { title: 'Ajouter les lignes', description: 'Ajoutez les prestations ou produits avec quantites, prix unitaires et taux de TVA. Le total se calcule automatiquement.', image_hint: 'invoice-lines' },
      { title: 'Activer le format Factur-X', description: 'Cochez l\'option Factur-X pour générer un PDF hybride contenant les données XML structurées.', image_hint: 'facturx-toggle' },
      { title: 'Envoyer la facture', description: 'Envoyez la facture par email directement depuis JADOMI ou téléchargez le PDF pour envoi manuel.', image_hint: 'send-invoice' }
    ]
  },
  {
    slug: 'signature-electronique',
    title: 'Configurer la signature électronique',
    description: 'Activez et personnalisez la signature électronique pour vos devis et contrats.',
    category: 'Facturation',
    difficulty: 'avancé',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Activer la signature électronique', description: 'Dans Paramètres puis Signature, activez le module de signature électronique conforme eIDAS.', image_hint: 'esign-activate' },
      { title: 'Configurer votre identité', description: 'Uploadez votre cachet ou signature manuscrite numérisée. Définissez les informations légales associées.', image_hint: 'identity-setup' },
      { title: 'Appliquer à un document', description: 'Depuis un devis ou contrat, cliquez sur Envoyer pour signature. Le destinataire reçoit un lien sécurisé.', image_hint: 'apply-signature' },
      { title: 'Suivi et archivage', description: 'Consultez l\'état des signatures en attente. Les documents signés sont archivés avec preuve de signature.', image_hint: 'sign-tracking' }
    ]
  },
  // --- Avance ---
  {
    slug: 'paniers-groupes',
    title: 'Paniers groupés',
    description: 'Mutualisez vos achats avec d\'autres professionnels pour obtenir les meilleurs tarifs fabricants.',
    category: 'Avancé',
    difficulty: 'avancé',
    duration_minutes: 6,
    video_url: null,
    steps: [
      { title: 'Découvrir les offres groupées', description: 'Accédez au module Paniers groupés depuis le menu principal. Consultez les offres en cours et les paliers de prix.', image_hint: 'grouped-offers' },
      { title: 'Rejoindre un panier', description: 'Sélectionnez un panier en cours et ajoutez vos quantités. Le prix baisse automatiquement à chaque nouveau participant.', image_hint: 'join-basket' },
      { title: 'Suivre les paliers', description: 'Visualisez en temps réel l\'avancement vers le prochain palier de prix et le nombre de participants.', image_hint: 'tier-progress' },
      { title: 'Créer votre propre panier', description: 'Proposez un produit ou équipement. Définissez les paliers et invitez d\'autres professionnels à vous rejoindre.', image_hint: 'create-basket' },
      { title: 'Finalisation et paiement', description: 'Une fois le délai écoulé, le panier est finalisé au meilleur palier atteint. Le paiement et la livraison sont coordonnés.', image_hint: 'finalize-basket' }
    ]
  },
  {
    slug: 'jadomi-ads',
    title: 'JADOMI Ads',
    description: 'Boostez votre visibilité avec les publicités ciblées JADOMI, gérées depuis votre tableau de bord.',
    category: 'Avancé',
    difficulty: 'avancé',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Accéder à JADOMI Ads', description: 'Depuis le menu principal, cliquez sur JADOMI Ads pour accéder au tableau de bord publicitaire.', image_hint: 'ads-dashboard' },
      { title: 'Créer une campagne', description: 'Définissez votre objectif (visibilité, prise de RDV, téléchargements), votre zone géographique et votre budget.', image_hint: 'create-campaign' },
      { title: 'Concevoir votre annonce', description: 'Utilisez l\'éditeur visuel pour créer votre annonce. Ajoutez texte, image et appel à l\'action.', image_hint: 'design-ad' },
      { title: 'Lancer et suivre', description: 'Lancez votre campagne et suivez les performances en temps réel : impressions, clics, conversions, coût.', image_hint: 'track-campaign' }
    ]
  },
  {
    slug: 'jadomi-studio',
    title: 'JADOMI Studio',
    description: 'Créez des visuels professionnels pour votre communication grâce à l\'assistant design IA.',
    category: 'Avancé',
    difficulty: 'avancé',
    duration_minutes: 5,
    video_url: null,
    steps: [
      { title: 'Ouvrir JADOMI Studio', description: 'Accédez à JADOMI Studio depuis le menu principal. L\'interface de création s\'ouvre avec vos éléments de marque.', image_hint: 'studio-open' },
      { title: 'Choisir un format', description: 'Sélectionnez le format de votre visuel : post réseaux sociaux, bannière site, affiche cabinet, carte de visite.', image_hint: 'format-select' },
      { title: 'Personnaliser le design', description: 'Utilisez les modèles pré-conçus ou partez de zéro. L\'IA suggère des mises en page adaptées à votre profession.', image_hint: 'design-editor' },
      { title: 'Exporter et partager', description: 'Exportez en PNG, PDF ou partagez directement sur vos réseaux sociaux connectés à JADOMI.', image_hint: 'export-share' }
    ]
  }
];

// ── Helpers ──
const CATEGORY_ORDER = ['Premiers pas', 'Gestion stock', 'Site vitrine', 'Patients', 'Facturation', 'Avancé'];
const CATEGORY_ICONS = {
  'Premiers pas': 'rocket',
  'Gestion stock': 'box',
  'Site vitrine': 'globe',
  'Patients': 'users',
  'Facturation': 'file-text',
  'Avancé': 'zap'
};

function getTutorialSummary(t) {
  return {
    slug: t.slug,
    title: t.title,
    description: t.description,
    category: t.category,
    difficulty: t.difficulty,
    duration_minutes: t.duration_minutes,
    steps_count: t.steps.length,
    video_url: t.video_url
  };
}

// ── Slug validation ──
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length <= 80 && SLUG_REGEX.test(slug);
}

// ── Routes ──

// GET /api/support/tutorials — list all tutorials
router.get('/', (req, res) => {
  try {
    const { category, difficulty, q } = req.query;
    let results = TUTORIALS;

    if (category) {
      results = results.filter(t => t.category.toLowerCase() === category.toLowerCase());
    }
    if (difficulty) {
      results = results.filter(t => t.difficulty === difficulty);
    }
    if (q) {
      const search = q.toLowerCase();
      results = results.filter(t =>
        t.title.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        t.steps.some(s => s.title.toLowerCase().includes(search) || s.description.toLowerCase().includes(search))
      );
    }

    const grouped = {};
    for (const cat of CATEGORY_ORDER) {
      const items = results.filter(t => t.category === cat);
      if (items.length > 0) {
        grouped[cat] = {
          icon: CATEGORY_ICONS[cat],
          tutorials: items.map(getTutorialSummary)
        };
      }
    }

    res.json({
      total: results.length,
      categories: grouped
    });
  } catch (e) {
    console.error('[Tutorials] list error:', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/support/tutorials/progress — user's watched tutorials (auth required)
router.get('/progress', (req, res, next) => {
  if (!authSupabase) return res.status(503).json({ error: 'auth_unavailable' });
  authSupabase()(req, res, next);
}, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.json({ progress: {} });

    const { data, error } = await supabaseAdmin
      .from('tutorial_progress')
      .select('tutorial_slug, completed_steps, completed_at')
      .eq('user_id', req.user.id);

    if (error) {
      console.error('[Tutorials] progress fetch error:', error.message);
      return res.json({ progress: {} });
    }

    const progress = {};
    for (const row of (data || [])) {
      progress[row.tutorial_slug] = {
        completed_steps: row.completed_steps || [],
        completed_at: row.completed_at
      };
    }
    res.json({ progress });
  } catch (e) {
    console.error('[Tutorials] progress error:', e.message);
    res.json({ progress: {} });
  }
});

// GET /api/support/tutorials/:slug — get tutorial detail
router.get('/:slug', (req, res) => {
  try {
    if (!isValidSlug(req.params.slug)) {
      return res.status(400).json({ error: 'Identifiant de tutoriel invalide' });
    }
    const tutorial = TUTORIALS.find(t => t.slug === req.params.slug);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel non trouvé' });
    res.json(tutorial);
  } catch (e) {
    console.error('[Tutorials] detail error:', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/support/tutorials/:slug/progress — mark tutorial progress (auth required)
router.post('/:slug/progress', (req, res, next) => {
  if (!authSupabase) return res.status(503).json({ error: 'auth_unavailable' });
  authSupabase()(req, res, next);
}, async (req, res) => {
  try {
    if (!isValidSlug(req.params.slug)) {
      return res.status(400).json({ error: 'Identifiant de tutoriel invalide' });
    }
    const tutorial = TUTORIALS.find(t => t.slug === req.params.slug);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel non trouvé' });

    const { completed_steps } = req.body || {};
    if (!Array.isArray(completed_steps) || completed_steps.length > 50) {
      return res.status(400).json({ error: 'completed_steps doit être un tableau (50 éléments max)' });
    }

    // Validate step indices and deduplicate
    const validSteps = [...new Set(completed_steps.filter(i => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < tutorial.steps.length))];

    const isComplete = validSteps.length >= tutorial.steps.length;

    if (!supabaseAdmin) {
      return res.json({ ok: true, completed_steps: validSteps, completed: isComplete, note: 'persistence_unavailable' });
    }

    const { error } = await supabaseAdmin
      .from('tutorial_progress')
      .upsert({
        user_id: req.user.id,
        tutorial_slug: req.params.slug,
        completed_steps: validSteps,
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,tutorial_slug' });

    if (error) {
      console.error('[Tutorials] progress save error:', error.message);
      // Non-blocking: return success anyway (graceful degradation)
    }

    res.json({ ok: true, completed_steps: validSteps, completed: isComplete });
  } catch (e) {
    console.error('[Tutorials] progress save error:', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
