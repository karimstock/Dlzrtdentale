// =============================================
// JADOMI — Shared Intelligence Layer
// Connecte le routeur métier et le routeur Studio
// Sans les fusionner — ils restent indépendants
//
// Principe : deux cerveaux spécialisés qui partagent
// une mémoire commune et un bus d'événements simple
// =============================================

const EventEmitter = require('events');

// Bus d'événements interne (in-process, pas besoin de Redis)
const bus = new EventEmitter();
bus.setMaxListeners(50);

// ═══════════════════════════════════════
// TYPES D'ÉVÉNEMENTS
// ═══════════════════════════════════════

const EVENT_TYPES = {
  // Métier → Studio
  EVENEMENT_CREE:       'evenement_cree',        // formation, congrès, réunion
  EVENEMENT_MODIFIE:    'evenement_modifie',
  PATIENT_MILESTONE:    'patient_milestone',      // 100e patient, anniversaire cabinet
  PRODUIT_COMMANDE:     'produit_commande',       // commande fournisseur récurrente
  SAISON_DETECTEE:      'saison_detectee',        // rentrée, Noël, été → campagne saisonnière

  // Studio → Métier
  CAMPAGNE_GENEREE:     'campagne_generee',       // créer tâches dans l'agenda
  TACHES_SUGGEREES:     'taches_suggerees',       // checklist auto
  CONTENU_PLANIFIE:     'contenu_planifie',       // post LinkedIn J-30 → rappel agenda
  DEADLINE_APPROCHE:    'deadline_approche',       // impression flyers 5 jours avant

  // Bidirectionnel
  HABITUDE_DETECTEE:    'habitude_detectee',       // pattern récurrent détecté
  PREFERENCE_APPRISE:   'preference_apprise',      // format/style préféré
};

// ═══════════════════════════════════════
// INTELLIGENCE STORE (lecture/écriture Supabase)
// ═══════════════════════════════════════

class SharedIntelligence {

  /**
   * Enregistre un signal d'intelligence (habitude, événement, préférence)
   */
  static async record(supabase, userId, signal) {
    const { type, data, source } = signal;

    try {
      const { error } = await supabase
        .from('user_intelligence')
        .insert({
          user_id: userId,
          type,
          source: source || 'auto',
          data: data || {},
          created_at: new Date().toISOString(),
        });

      if (error) console.error('[INTEL] record error:', error.message);

      // Émettre l'événement pour les listeners
      bus.emit(type, { userId, ...signal });

    } catch (e) {
      console.error('[INTEL] record exception:', e.message);
    }
  }

  /**
   * Récupère les signaux récents d'un utilisateur
   */
  static async getRecent(supabase, userId, options = {}) {
    const { type, limit: lim, days } = options;

    let query = supabase
      .from('user_intelligence')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(lim || 50);

    if (type) query = query.eq('type', type);

    if (days) {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) console.error('[INTEL] getRecent error:', error.message);
    return data || [];
  }

  /**
   * Détecte les habitudes d'un utilisateur à partir de l'historique
   * Appelé périodiquement (cron ou fin de journée)
   */
  static async detectHabitudes(supabase, userId) {
    const habitudes = [];

    // 1. Événements récurrents (même type + même période)
    const events = await this.getRecent(supabase, userId, {
      type: EVENT_TYPES.EVENEMENT_CREE,
      days: 365,
    });

    // Détecter les patterns mensuels
    const byMonth = {};
    for (const e of events) {
      const month = new Date(e.created_at).getMonth();
      const evType = e.data?.type_evenement || 'general';
      const key = `${month}-${evType}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    }
    for (const [key, count] of Object.entries(byMonth)) {
      if (count >= 2) {
        const [month, evType] = key.split('-');
        habitudes.push({
          type: 'evenement_recurrent',
          description: `${evType} organisé chaque ${monthName(parseInt(month))}`,
          confidence: Math.min(count / 3, 1),
          data: { month: parseInt(month), event_type: evType, occurrences: count },
        });
      }
    }

    // 2. Formats préférés Studio
    const generations = await this.getRecent(supabase, userId, {
      type: 'generation_validee',
      days: 90,
    });

    const formatCount = {};
    for (const g of generations) {
      const fmt = g.data?.format || 'unknown';
      formatCount[fmt] = (formatCount[fmt] || 0) + 1;
    }
    const topFormats = Object.entries(formatCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topFormats.length > 0) {
      habitudes.push({
        type: 'formats_preferes',
        description: `Formats favoris : ${topFormats.map(f => f[0]).join(', ')}`,
        confidence: 0.8,
        data: { formats: topFormats },
      });
    }

    return habitudes;
  }

  /**
   * Détecte le rôle de l'utilisateur dans un événement
   * CRITIQUE : "formation" peut signifier organisateur, participant ou envoi d'équipe
   * @param {string} text - texte de la demande
   * @param {object} userProfile - profil utilisateur (is_formateur, etc.)
   * @returns {{ role: string, confidence: number }}
   */
  static detectRole(text, userProfile = {}) {
    const lower = (text || '').toLowerCase();

    // Indices ORGANISATEUR (il fait la formation)
    const orgaIndices = [
      /\b(j'organise|j'anime|je donne|je dispense|ma formation|mon cours)\b/,
      /\b(mes participants|mes inscrits|mes stagiaires|mon programme)\b/,
      /\b(je forme|je présente|mon intervention|ma conférence)\b/,
      /\b(créer une formation|lancer une formation|planifier une formation)\b/,
      /\b(salle réservée|nombre de places|inscriptions|tarif formation)\b/,
    ];

    // Indices PARTICIPANT (il assiste)
    const partIndices = [
      /\b(je participe|j'assiste|je vais à|je m'inscris|j'y vais)\b/,
      /\b(m'inscrire|s'inscrire|réserver ma place)\b/,
      /\b(formation de|formation chez|formation par|formation avec)\b/,
      /\b(suivre une formation|assister à|aller à la formation)\b/,
      /\b(mon billet|ma place|mon inscription|confirmation d'inscription)\b/,
    ];

    // Indices ENVOI EQUIPE (il envoie son équipe)
    const equipeIndices = [
      /\b(envoyer (mon|ma|l'|une) (assistante|secrétaire|équipe|collaborat))\b/,
      /\b(inscrire (mon|ma|l') (assistante|secrétaire|équipe))\b/,
      /\b(pour (mon|ma|l') (assistante|secrétaire|équipe))\b/,
      /\b(formation pour (le|la|les) (personnel|staff|salarié))\b/,
    ];

    let orgaScore = 0, partScore = 0, equipeScore = 0;

    for (const p of orgaIndices) if (p.test(lower)) orgaScore++;
    for (const p of partIndices) if (p.test(lower)) partScore++;
    for (const p of equipeIndices) if (p.test(lower)) equipeScore++;

    // Bonus profil : si l'utilisateur est connu comme formateur
    if (userProfile.is_formateur || userProfile.is_formation_provider) orgaScore += 2;

    // Si aucun indice clair → demander (confidence basse)
    const total = orgaScore + partScore + equipeScore;
    if (total === 0) {
      return { role: 'inconnu', confidence: 0, need_clarification: true,
        question: 'Vous organisez cette formation ou vous y participez ?' };
    }

    if (orgaScore > partScore && orgaScore > equipeScore) {
      return { role: 'organisateur', confidence: Math.min(orgaScore / 3, 1) };
    }
    if (partScore > orgaScore && partScore > equipeScore) {
      return { role: 'participant', confidence: Math.min(partScore / 3, 1) };
    }
    if (equipeScore > 0) {
      return { role: 'envoi_equipe', confidence: Math.min(equipeScore / 2, 1) };
    }

    // Ambiguïté
    return { role: 'inconnu', confidence: 0.3, need_clarification: true,
      question: 'Vous organisez cette formation, vous y participez, ou vous envoyez votre équipe ?' };
  }

  /**
   * Génère des suggestions de tâches pour un événement
   * SELON LE RÔLE de l'utilisateur (organisateur, participant, équipe)
   * Utilisé par Studio pour pré-remplir la checklist
   */
  static generateChecklist(eventType, eventData = {}) {
    const role = eventData.role || 'organisateur';

    const checklists = {
      // ── FORMATION : ORGANISATEUR (il donne la formation) ──
      formation_organisateur: [
        { j: -30, tache: 'Publier le post LinkedIn d\'annonce', canal: 'reseaux' },
        { j: -21, tache: 'Envoyer les emails d\'invitation', canal: 'email' },
        { j: -14, tache: 'Relancer les inscrits non confirmés', canal: 'email' },
        { j: -7,  tache: 'Confirmer la salle et le matériel', canal: 'agenda' },
        { j: -7,  tache: 'Commander le traiteur / pause café', canal: 'agenda' },
        { j: -5,  tache: 'Imprimer les badges et les supports', canal: 'agenda' },
        { j: -3,  tache: 'Préparer les slides et le matériel pédagogique', canal: 'agenda' },
        { j: -3,  tache: 'Post countdown "J-3"', canal: 'reseaux' },
        { j: -1,  tache: 'Post "C\'est demain !"', canal: 'reseaux' },
        { j: -1,  tache: 'Vérifier vidéoprojecteur, câbles, rallonges', canal: 'agenda' },
        { j: 0,   tache: 'Story/Reel live pendant la formation', canal: 'reseaux' },
        { j: 1,   tache: 'Post remerciements + photos', canal: 'reseaux' },
        { j: 1,   tache: 'Envoyer l\'email de satisfaction', canal: 'email' },
        { j: 3,   tache: 'Envoyer les certificats / attestations', canal: 'email' },
        { j: 7,   tache: 'Post retour d\'expérience / témoignage', canal: 'reseaux' },
      ],

      // ── FORMATION : PARTICIPANT (il assiste) ──
      formation_participant: [
        { j: -14, tache: 'Confirmer l\'inscription', canal: 'agenda' },
        { j: -7,  tache: 'Vérifier les horaires et le lieu', canal: 'agenda' },
        { j: -3,  tache: 'Organiser le remplacement au cabinet', canal: 'agenda' },
        { j: -1,  tache: 'Préparer le matériel (bloc-notes, questions)', canal: 'agenda' },
        { j: -1,  tache: 'Réserver transport / hôtel si nécessaire', canal: 'agenda' },
        { j: 0,   tache: 'Photo / Story LinkedIn "En formation aujourd\'hui"', canal: 'reseaux' },
        { j: 1,   tache: 'Post LinkedIn résumé de la formation', canal: 'reseaux' },
        { j: 3,   tache: 'Appliquer les apprentissages au cabinet', canal: 'agenda' },
      ],

      // ── FORMATION : ENVOI EQUIPE ──
      formation_envoi_equipe: [
        { j: -14, tache: 'Confirmer l\'inscription de l\'équipe', canal: 'agenda' },
        { j: -7,  tache: 'Organiser le remplacement au cabinet', canal: 'agenda' },
        { j: -3,  tache: 'Briefer l\'équipe sur les objectifs de la formation', canal: 'agenda' },
        { j: -1,  tache: 'Confirmer les horaires avec l\'équipe', canal: 'agenda' },
        { j: 1,   tache: 'Débrief avec l\'équipe : qu\'ont-ils appris ?', canal: 'agenda' },
        { j: 3,   tache: 'Mettre en place les nouvelles pratiques', canal: 'agenda' },
      ],

      // ── CONGRÈS : EXPOSANT (il a un stand) ──
      congres_organisateur: [
        { j: -60, tache: 'Réserver le stand', canal: 'agenda' },
        { j: -45, tache: 'Créer les visuels stand (bannière, écran)', canal: 'studio' },
        { j: -30, tache: 'Post countdown "J-30"', canal: 'reseaux' },
        { j: -21, tache: 'Envoyer les invitations VIP', canal: 'email' },
        { j: -14, tache: 'Commander les goodies / PLV', canal: 'agenda' },
        { j: -10, tache: 'Imprimer les badges équipe', canal: 'agenda' },
        { j: -7,  tache: 'Post countdown "J-7"', canal: 'reseaux' },
        { j: -3,  tache: 'Vérifier le matériel, le stand, les produits', canal: 'agenda' },
        { j: -1,  tache: 'Installer le stand', canal: 'agenda' },
        { j: 0,   tache: 'Stories / Reels live depuis le congrès', canal: 'reseaux' },
        { j: 1,   tache: 'Post bilan + remerciements', canal: 'reseaux' },
        { j: 3,   tache: 'Email suivi des contacts / leads', canal: 'email' },
      ],

      // ── CONGRÈS : VISITEUR (il y va sans stand) ──
      congres_participant: [
        { j: -7,  tache: 'Consulter le programme et repérer les conférences', canal: 'agenda' },
        { j: -3,  tache: 'Organiser le remplacement au cabinet', canal: 'agenda' },
        { j: -1,  tache: 'Préparer les questions pour les exposants', canal: 'agenda' },
        { j: 0,   tache: 'Photo / Story "Au congrès aujourd\'hui"', canal: 'reseaux' },
        { j: 0,   tache: 'Récupérer les cartes de visite intéressantes', canal: 'agenda' },
        { j: 1,   tache: 'Post LinkedIn résumé + photos', canal: 'reseaux' },
        { j: 3,   tache: 'Contacter les fournisseurs intéressants', canal: 'agenda' },
      ],

      // ── LANCEMENT PRODUIT ──
      lancement_produit: [
        { j: -14, tache: 'Créer la fiche produit premium', canal: 'studio' },
        { j: -10, tache: 'Créer la vidéo teaser produit', canal: 'studio' },
        { j: -7,  tache: 'Post teaser "Bientôt..."', canal: 'reseaux' },
        { j: -3,  tache: 'Email pré-lancement aux clients fidèles', canal: 'email' },
        { j: 0,   tache: 'Publication officielle tous canaux', canal: 'reseaux' },
        { j: 0,   tache: 'Landing page live', canal: 'studio' },
        { j: 1,   tache: 'Email de lancement à la base complète', canal: 'email' },
        { j: 7,   tache: 'Post retours clients / témoignages', canal: 'reseaux' },
      ],

      // ── SENSIBILISATION PATIENT ──
      sensibilisation: [
        { j: 0,   tache: 'Imprimer l\'affiche salle d\'attente', canal: 'agenda' },
        { j: 0,   tache: 'Publier le post patient éducatif', canal: 'reseaux' },
        { j: 7,   tache: 'Relayer le post sur Facebook', canal: 'reseaux' },
        { j: 14,  tache: 'Nouveau post sur le même thème (angle différent)', canal: 'reseaux' },
      ],
    };

    // Construire la clé : eventType + role
    const key = `${eventType}_${role}`;
    const checklist = checklists[key] || checklists[eventType + '_organisateur'] || checklists.sensibilisation;

    // Si on a une date d'événement, calculer les dates absolues
    if (eventData.date) {
      const eventDate = new Date(eventData.date);
      return checklist.map(item => ({
        ...item,
        date_prevue: new Date(eventDate.getTime() + item.j * 86400000).toISOString().split('T')[0],
      }));
    }

    return checklist;
  }

  // ── Bus d'événements ──
  static on(event, handler) { bus.on(event, handler); }
  static off(event, handler) { bus.off(event, handler); }
  static emit(event, data) { bus.emit(event, data); }
}

// Helper
function monthName(m) {
  return ['janvier','février','mars','avril','mai','juin',
    'juillet','août','septembre','octobre','novembre','décembre'][m] || '';
}

module.exports = { SharedIntelligence, EVENT_TYPES, bus };
