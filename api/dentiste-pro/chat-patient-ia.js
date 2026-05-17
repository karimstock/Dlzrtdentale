// =============================================
// JADOMI — Chat IA Patient + Prise de RDV automatisée
// Endpoints : POST /message, POST /rdv/rechercher,
//             POST /rdv/confirmer, GET /historique,
//             POST /transcription
// Provider IA : DeepSeek (0.14EUR/M tokens)
// Fallback : détection locale par mots-clés
// =============================================
const express = require('express');
const crypto = require('crypto');
const { admin, requirePatient } = require('./shared');

const router = express.Router();

// ===== Configuration DeepSeek =====
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// ===== Catalogue des durées par acte (extrait de agenda.js) =====
const DUREES_ACTES = {
  'detartrage': 30,
  'consultation': 30,
  'premiere_consultation': 30,
  'consultation_controle': 15,
  'consultation_urgence': 20,
  'consultation_devis': 20,
  'soin_carie_1face': 20,
  'soin_carie_2faces': 30,
  'soin_carie_3faces': 40,
  'extraction_simple': 20,
  'extraction_complexe': 45,
  'extraction_dds': 45,
  'endo_mono': 45,
  'endo_premolaire': 60,
  'endo_molaire': 90,
  'couronne_empreinte': 45,
  'couronne_pose': 30,
  'bridge_empreinte': 60,
  'blanchiment_fauteuil': 90,
  'implant_pose': 60,
  'radio_panoramique': 15,
  'scellement_sillon': 15,
  'bilan_parodontal': 45,
  'surfacage_1secteur': 45
};

// Durée par défaut si acte non trouvé
function getDureeActe(acte) {
  if (!acte) return 30;
  const key = acte.toLowerCase().replace(/[\s-]+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Recherche exacte
  if (DUREES_ACTES[key]) return DUREES_ACTES[key];
  // Recherche partielle
  for (const [k, v] of Object.entries(DUREES_ACTES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 30;
}

// ===== Mapping mots-clés → actes pour extraction d'entités =====
const MOTS_ACTES = {
  'détartrage': 'detartrage',
  'detartrage': 'detartrage',
  'nettoyage': 'detartrage',
  'consultation': 'premiere_consultation',
  'contrôle': 'consultation_controle',
  'controle': 'consultation_controle',
  'suivi': 'consultation_controle',
  'carie': 'soin_carie_1face',
  'extraction': 'extraction_simple',
  'arracher': 'extraction_simple',
  'couronne': 'couronne_empreinte',
  'bridge': 'bridge_empreinte',
  'implant': 'implant_pose',
  'blanchiment': 'blanchiment_fauteuil',
  'radio': 'radio_panoramique',
  'dent de sagesse': 'extraction_dds',
  'sagesse': 'extraction_dds',
  'prothèse': 'couronne_empreinte',
  'prothese': 'couronne_empreinte',
  'scellement': 'scellement_sillon'
};

// ===== Modération — ZÉRO TOLÉRANCE =====
const MOTS_INTERDITS = /putain|merde|connard|connasse|salope|enculé|nique|fils\s*de\s*pute|pd|pédé|tapette|bougnoule|négro|arabe.*sale|sale.*arabe|sale.*noir|racaille|sucer|baiser|sexe|nude|sein|pénis|vagin|bite|cul|fellation|sodomie|pédoph/i;
const MOTS_WARNING = /con\b|idiot|débile|nul|incompétent|arnaque|voleur|escroc/i;

function modererMessage(text) {
  if (!text) return { ok: true };
  if (MOTS_INTERDITS.test(text)) {
    return {
      ok: false,
      niveau: 'bloque',
      reply: 'Ce type de message est strictement interdit. JADOMI applique une politique de tolérance zéro envers les propos injurieux, sexuels, racistes ou haineux. En cas de récidive, votre accès sera suspendu.'
    };
  }
  if (MOTS_WARNING.test(text)) {
    return {
      ok: true,
      niveau: 'avertissement',
      avertissement: 'Merci de conserver un ton respectueux dans vos échanges. Nous sommes là pour vous aider.'
    };
  }
  return { ok: true };
}

// ===== System prompt pour DeepSeek =====
const SYSTEM_PROMPT = `Tu es l'assistant IA JADOMI pour les patients d'un cabinet dentaire.
REGLES :
- Vouvoiement obligatoire
- Réponses courtes et claires (3 phrases max)
- Pas d'emoji
- Tu dois TOUJOURS répondre en JSON valide : { "intent": "rdv|annuler|info|urgence|photo|autre", "reply": "texte", "entities": { "date": null, "heure": null, "acte": null, "langue": null } }
- Pour les RDV, guide le patient étape par étape : acte souhaité, puis date/heure préférée, puis proposition de créneaux
- En cas d'urgence, orienter immédiatement vers le cabinet ou les urgences dentaires
- Ne JAMAIS donner de diagnostic médical
- Ne JAMAIS tutoyer le patient
- Les dates doivent être au format YYYY-MM-DD si détectées
- Les heures doivent être au format HH:MM si détectées
- Si le patient envoie un message dans une langue étrangère, répondre DANS SA LANGUE
- Ajouter "langue": "code_ISO" dans entities (ex: "ar", "tr", "en", "fr")
- Si le patient mentionne une photo, un document, un devis, un courrier de spécialiste, noter intent: "photo"
- Si le patient est insultant ou inapproprié, répondre fermement mais poliment en rappelant les règles`;

// ===== Appel DeepSeek =====
async function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[chat-patient-ia] DEEPSEEK_API_KEY manquante, fallback local');
    return fallbackLocal(messages);
  }
  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!resp.ok) {
      console.warn('[chat-patient-ia] DeepSeek HTTP', resp.status, '— fallback local');
      return fallbackLocal(messages);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || fallbackLocal(messages);
  } catch (e) {
    console.warn('[chat-patient-ia] DeepSeek error:', e.message, '— fallback local');
    return fallbackLocal(messages);
  }
}

// ===== Triage d'urgence dentaire =====
// Niveaux : critique (immédiat), urgent (dans la journée), semi-urgent (24-48h)
function triageUrgence(text) {
  const t = text.toLowerCase();
  const enfant = /enfant|fils|fille|bébé|bebe|petit|gamin|ans?\b.*\b[2-9]\b|\b1[0-2]\b.*ans/.test(t);

  // === NIVEAU CRITIQUE — Appeler le cabinet immédiatement ===

  // Cellulite (infection grave, potentiellement mortelle)
  if (/cellulite|joue.*gonfl|gonfl.*joue|visage.*gonfl|gonfl.*visage|oeil.*gonfl|gonfl.*oeil|fièvre.*gonfl|gonfl.*fièvre|difficulté.*avaler|avaler.*difficile|difficulté.*respir|respir.*difficile/.test(t)) {
    return {
      niveau: 'critique',
      type: 'cellulite',
      enfant,
      reply: enfant
        ? 'ATTENTION : un gonflement du visage chez un enfant avec de la fièvre peut être une cellulite faciale. C\'est une URGENCE ABSOLUE. Rendez-vous immédiatement aux urgences hospitalières ou appelez le 15 (SAMU). Nous prévenons le cabinet.'
        : 'ATTENTION : un gonflement du visage avec fièvre ou difficulté à avaler peut être une cellulite faciale. C\'est une urgence grave. Rendez-vous aux urgences hospitalières ou appelez le 15 (SAMU). Nous informons le cabinet immédiatement.'
    };
  }

  // Expulsion dentaire (dent tombée entière)
  if (/expuls|tombée|tombe|arraché|arrache|dent.*parti|parti.*dent|perdu.*dent|dent.*perdu|sorti.*dent|dent.*sorti/.test(t)) {
    const permanente = /permanent|définitif|adulte/.test(t) || !enfant;
    return {
      niveau: 'critique',
      type: 'expulsion',
      enfant,
      reply: permanente
        ? 'URGENCE : si la dent est une dent permanente (définitive), récupérez le morceau, conservez-le dans du lait ou du sérum physiologique (JAMAIS d\'eau du robinet). Ne touchez pas la racine. Plus vous consultez rapidement, plus les chances de réimplantation sont élevées. Nous vous inscrivons en urgence au cabinet.'
        : 'Si c\'est une dent de lait, ne tentez pas de la remettre en place. Conservez le morceau et consultez rapidement. Nous vous inscrivons en urgence au cabinet.'
    };
  }

  // Fracture dentaire
  if (/fracture|cassé|casse|brisé|brise|fendu|fêlé|fele|morceau.*dent|dent.*cassé|bout.*dent/.test(t)) {
    return {
      niveau: 'critique',
      type: 'fracture',
      enfant,
      reply: enfant
        ? 'URGENT : pour une dent cassée chez un enfant, récupérez le morceau et conservez-le dans du lait ou du sérum physiologique. Ne touchez pas la zone avec les doigts. Consultez le plus rapidement possible — nous vous inscrivons en urgence au cabinet.'
        : 'URGENT : récupérez le morceau de dent si possible et conservez-le dans du lait ou du sérum physiologique. Évitez de manger du côté touché. Nous vous inscrivons en urgence au cabinet pour vous voir le plus vite possible.'
    };
  }

  // Hémorragie
  if (/saigne.*beaucoup|beaucoup.*saigne|hémorragie|hemorragie|sang.*arrête.*pas|arrête.*pas.*sang|saigne.*stop/.test(t)) {
    return {
      niveau: 'critique',
      type: 'hemorragie',
      enfant,
      reply: 'Comprimez la zone avec une compresse propre pendant 15 minutes en mordant dessus. Si le saignement ne s\'arrête pas après 20 minutes, rendez-vous aux urgences. Nous vous inscrivons en urgence au cabinet.'
    };
  }

  // === NIVEAU URGENT — Dans la journée ===

  // Abcès
  if (/abcès|abces|pus\b|infection|boule.*gencive|gencive.*boule/.test(t)) {
    return {
      niveau: 'urgent',
      type: 'abces',
      enfant,
      reply: enfant
        ? 'Un abcès dentaire chez un enfant nécessite une prise en charge rapide. Ne percez pas l\'abcès. Donnez-lui du paracétamol si besoin (jamais d\'ibuprofène sans avis médical). Nous vous inscrivons en urgence au cabinet pour aujourd\'hui.'
        : 'Un abcès dentaire nécessite un traitement rapide. Ne percez pas l\'abcès. Vous pouvez prendre du paracétamol en attendant. Nous vous inscrivons en urgence au cabinet.'
    };
  }

  // Douleur intense
  if (/douleur.*intense|intense.*douleur|très.*mal|insupportable|atroce|terrible|ne.*dors.*plus|empêche.*dormir/.test(t)) {
    return {
      niveau: 'urgent',
      type: 'douleur_intense',
      enfant,
      reply: 'En attendant votre rendez-vous, vous pouvez prendre du paracétamol (respectez la posologie). Évitez les aliments chauds ou froids sur la zone douloureuse. Nous vous inscrivons en urgence au cabinet pour être vu au plus vite.'
    };
  }

  // === NIVEAU SEMI-URGENT — 24-48h ===
  return {
    niveau: 'semi-urgent',
    type: 'douleur',
    enfant,
    reply: 'Nous prenons note de votre douleur. Prenez du paracétamol si besoin et évitez les aliments très chauds ou froids. Nous vous inscrivons dans la liste d\'urgence du cabinet pour vous recevoir rapidement, en priorité si une annulation se présente.'
  };
}

// ===== Inscrire le patient en liste d'urgence =====
async function inscrireUrgence(cabinetId, patientId, triage, messagePatient) {
  try {
    const db = admin();

    // Charger les infos du patient
    const { data: patient } = await db
      .from('dentiste_pro_patients')
      .select('nom, prenom, telephone')
      .eq('id', patientId)
      .maybeSingle();

    const nomPatient = patient ? `${patient.prenom} ${patient.nom}` : 'Patient';
    const telPatient = patient?.telephone || '';

    // Calculer le score d'urgence (0-10)
    const scoreMap = { 'critique': 10, 'urgent': 8, 'semi-urgent': 5 };
    const urgencyScore = scoreMap[triage.niveau] || 5;

    // Construire la note d'urgence pour le dentiste
    const noteUrgence = [
      `URGENCE ${triage.niveau.toUpperCase()} — ${triage.type.replace(/_/g, ' ')}`,
      triage.enfant ? 'ENFANT' : '',
      `Ce que le patient a dit : "${messagePatient.substring(0, 200)}"`,
      triage.type === 'cellulite' ? 'ALERTE : risque cellulite faciale — vérifier immédiatement' : '',
      triage.type === 'expulsion' ? 'ALERTE : expulsion/avulsion — réimplantation possible si rapide' : '',
      triage.type === 'fracture' ? 'ALERTE : fracture dentaire — le patient a été informé de conserver le morceau dans du lait' : '',
      triage.type === 'hemorragie' ? 'ALERTE : hémorragie — compression en cours' : ''
    ].filter(Boolean).join('\n');

    // Inscrire dans la waitlist (liste d'attente d'urgence)
    const { data: entry, error } = await db
      .from('dentiste_pro_waitlist')
      .insert({
        cabinet_id: cabinetId,
        patient_id: patientId,
        patient_nom: patient?.nom || '',
        patient_prenom: patient?.prenom || '',
        patient_tel: telPatient,
        appointment_type_id: null,
        urgency_score: urgencyScore,
        notes: noteUrgence,
        status: 'waiting',
        source: 'chat_ia_urgence',
        wait_since: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[chat-patient-ia] Inscription urgence waitlist échouée:', error.message);
      // Fallback : sauver dans les messages IA avec tag urgence
      await sauverMessage(cabinetId, patientId, 'ia', `[URGENCE ${triage.niveau}] ${noteUrgence}`, 'urgence', {
        niveau: triage.niveau,
        type: triage.type,
        enfant: triage.enfant,
        score: urgencyScore
      });
    }

    console.log(`[chat-patient-ia] URGENCE ${triage.niveau} inscrite — patient ${nomPatient} (${telPatient}) — type: ${triage.type}${triage.enfant ? ' — ENFANT' : ''}`);

    return { success: true, waitlist_id: entry?.id, score: urgencyScore };
  } catch (e) {
    console.error('[chat-patient-ia] Erreur inscription urgence:', e.message);
    return { success: false };
  }
}

// ===== Fallback sans IA : détection par mots-clés =====
function fallbackLocal(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase();

  // Extraction d'entités basique
  const entities = { date: null, heure: null, acte: null };

  // Détection acte
  for (const [mot, acte] of Object.entries(MOTS_ACTES)) {
    if (last.includes(mot)) {
      entities.acte = acte;
      break;
    }
  }

  // Détection date relative
  const aujourdhui = new Date();
  if (/demain/.test(last)) {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() + 1);
    entities.date = d.toISOString().slice(0, 10);
  } else if (/après[- ]?demain/.test(last)) {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() + 2);
    entities.date = d.toISOString().slice(0, 10);
  } else if (/lundi/.test(last)) {
    entities.date = getNextWeekday(1);
  } else if (/mardi/.test(last)) {
    entities.date = getNextWeekday(2);
  } else if (/mercredi/.test(last)) {
    entities.date = getNextWeekday(3);
  } else if (/jeudi/.test(last)) {
    entities.date = getNextWeekday(4);
  } else if (/vendredi/.test(last)) {
    entities.date = getNextWeekday(5);
  } else if (/samedi/.test(last)) {
    entities.date = getNextWeekday(6);
  }

  // Détection heure
  const heureMatch = last.match(/(\d{1,2})\s*[hH:]\s*(\d{0,2})/);
  if (heureMatch) {
    const h = heureMatch[1].padStart(2, '0');
    const m = (heureMatch[2] || '00').padStart(2, '0');
    entities.heure = `${h}:${m}`;
  }

  // Détection créneau matin/après-midi
  if (/matin/.test(last) && !entities.heure) {
    entities.heure = 'matin';
  } else if (/après[- ]?midi|aprem/.test(last) && !entities.heure) {
    entities.heure = 'apres-midi';
  }

  // Détection intention
  if (/rendez[- ]?vous|rdv|prendre|réserver|reserver|consultation|détartrage|detartrage|contrôle|controle/.test(last)) {
    let reply = 'Bien sûr ! Quand seriez-vous disponible ? Avez-vous une préférence de jour ou de créneau horaire ?';
    if (entities.acte && entities.date) {
      reply = 'Je vais rechercher les créneaux disponibles pour vous.';
    } else if (entities.acte && !entities.date) {
      reply = 'Très bien. Quel jour vous conviendrait le mieux ?';
    }
    return JSON.stringify({ intent: 'rdv', reply, entities });
  }
  if (/annul|supprimer|reporter|déplacer|deplacer/.test(last)) {
    return JSON.stringify({
      intent: 'annuler',
      reply: 'Je vais vérifier vos rendez-vous. Un instant...',
      entities
    });
  }
  if (/urgence|douleur|mal\b|saigne|gonflé|gonfle|abcès|abces|cassé|casse|trauma|fracture|tombée|tombe|arraché|arrache|expuls|cellulite|enflé|enfle|joue gonfl|fièvre|fiévre|fievre|pus\b|infection/.test(last)) {
    const triage = triageUrgence(last);
    entities.urgence_niveau = triage.niveau;
    entities.urgence_type = triage.type;
    entities.urgence_enfant = triage.enfant;
    return JSON.stringify({
      intent: 'urgence',
      reply: triage.reply,
      entities
    });
  }
  if (/horaire|ouvert|fermé|ferme|adresse|téléphone|telephone|numéro|numero|où|parking/.test(last)) {
    return JSON.stringify({
      intent: 'info',
      reply: 'Pour connaître les horaires et coordonnées du cabinet, rendez-vous dans la rubrique "Mon cabinet" de votre application.',
      entities
    });
  }
  return JSON.stringify({
    intent: 'autre',
    reply: 'Je suis l\'assistant JADOMI. Je peux vous aider à prendre rendez-vous, vérifier vos prochains rendez-vous, ou répondre à vos questions sur le cabinet. Que puis-je faire pour vous ?',
    entities
  });
}

// ===== Helper : prochain jour de la semaine =====
function getNextWeekday(dayOfWeek) {
  const today = new Date();
  const current = today.getDay();
  let diff = dayOfWeek - current;
  if (diff <= 0) diff += 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return target.toISOString().slice(0, 10);
}

// ===== Helper : parser la réponse IA (JSON ou texte) =====
function parseIAResponse(raw) {
  if (!raw) return { intent: 'autre', reply: 'Je n\'ai pas pu traiter votre demande. Veuillez réessayer.', entities: {} };
  try {
    // Essayer de parser le JSON directement
    const parsed = JSON.parse(raw);
    return {
      intent: parsed.intent || 'autre',
      reply: parsed.reply || raw,
      entities: parsed.entities || {}
    };
  } catch {
    // Si pas du JSON valide, essayer d'extraire le JSON du texte
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'autre',
          reply: parsed.reply || raw,
          entities: parsed.entities || {}
        };
      } catch {
        // Pas de JSON trouvé
      }
    }
    return { intent: 'autre', reply: raw, entities: {} };
  }
}

// ===== Helper : sauvegarder un message en base =====
async function sauverMessage(cabinetId, patientId, role, content, intent, entities) {
  try {
    const db = admin();
    await db.from('chat_patient_ia_messages').insert({
      cabinet_id: cabinetId,
      patient_id: patientId,
      role,
      content,
      intent: intent || null,
      entities: entities || {}
    });
  } catch (e) {
    // Table peut ne pas exister encore — pas bloquant
    console.warn('[chat-patient-ia] Sauvegarde message échouée:', e.message);
  }
}

// ===== Helper : charger les horaires du cabinet =====
async function getHorairesCabinet(cabinetId) {
  try {
    const db = admin();
    const { data } = await db
      .from('dentiste_pro_cabinets')
      .select('horaires, nom')
      .eq('id', cabinetId)
      .maybeSingle();

    if (data && data.horaires) return data.horaires;
  } catch (e) {
    console.warn('[chat-patient-ia] Horaires cabinet non trouvés:', e.message);
  }

  // Horaires par défaut d'un cabinet dentaire
  return {
    lundi:    { matin: { debut: '09:00', fin: '12:30' }, aprem: { debut: '14:00', fin: '19:00' } },
    mardi:    { matin: { debut: '09:00', fin: '12:30' }, aprem: { debut: '14:00', fin: '19:00' } },
    mercredi: { matin: { debut: '09:00', fin: '12:30' }, aprem: { debut: '14:00', fin: '19:00' } },
    jeudi:    { matin: { debut: '09:00', fin: '12:30' }, aprem: { debut: '14:00', fin: '19:00' } },
    vendredi: { matin: { debut: '09:00', fin: '12:30' }, aprem: { debut: '14:00', fin: '19:00' } },
    samedi:   { matin: { debut: '09:00', fin: '13:00' } }
  };
}

// ===== Helper : noms des jours =====
const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_SEMAINE_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// ===== Helper : calculer les créneaux disponibles =====
async function calculerCreneauxDisponibles(cabinetId, dateStr, dureeMinutes, preference) {
  const horaires = await getHorairesCabinet(cabinetId);
  const dateObj = new Date(dateStr + 'T00:00:00');
  const jourSemaine = JOURS_SEMAINE[dateObj.getDay()];

  // Vérifier que le cabinet est ouvert ce jour
  const horaireJour = horaires[jourSemaine];
  if (!horaireJour) {
    return { disponible: false, message: `Le cabinet est fermé le ${jourSemaine}.` };
  }

  // Construire les plages horaires ouvertes
  const plages = [];
  if (horaireJour.matin && (!preference || preference === 'matin')) {
    plages.push({
      debut: timeToMinutes(horaireJour.matin.debut),
      fin: timeToMinutes(horaireJour.matin.fin),
      label: 'matin'
    });
  }
  if (horaireJour.aprem && (!preference || preference === 'apres-midi')) {
    plages.push({
      debut: timeToMinutes(horaireJour.aprem.debut),
      fin: timeToMinutes(horaireJour.aprem.fin),
      label: 'après-midi'
    });
  }

  if (plages.length === 0) {
    return { disponible: false, message: `Aucun créneau disponible le ${jourSemaine} pour la période souhaitée.` };
  }

  // Charger les RDV existants pour cette date
  const rdvExistants = await getRdvDuJour(cabinetId, dateStr);

  // Calculer les créneaux libres (par pas de 15 min)
  const creneauxLibres = [];
  for (const plage of plages) {
    for (let t = plage.debut; t + dureeMinutes <= plage.fin; t += 15) {
      const finCreneau = t + dureeMinutes;
      // Vérifier qu'il n'y a pas de chevauchement
      const conflit = rdvExistants.some(rdv => {
        const rdvDebut = rdv.debutMin;
        const rdvFin = rdv.finMin;
        return t < rdvFin && finCreneau > rdvDebut;
      });
      if (!conflit) {
        creneauxLibres.push({
          debut: minutesToTime(t),
          fin: minutesToTime(finCreneau),
          debutMin: t,
          periode: plage.label
        });
      }
    }
  }

  if (creneauxLibres.length === 0) {
    return { disponible: false, message: `Aucun créneau libre le ${formatDateFR(dateStr)} pour une durée de ${dureeMinutes} minutes.` };
  }

  // Retourner les 3 meilleurs créneaux (répartis si possible)
  const meilleurs = selectionnerMeilleurs(creneauxLibres, 3);

  return {
    disponible: true,
    creneaux: meilleurs,
    total_disponibles: creneauxLibres.length,
    date: dateStr,
    jour: jourSemaine,
    duree_minutes: dureeMinutes
  };
}

// ===== Helper : RDV du jour =====
async function getRdvDuJour(cabinetId, dateStr) {
  const rdvs = [];
  try {
    const db = admin();
    const debutJour = dateStr + 'T00:00:00';
    const finJour = dateStr + 'T23:59:59';

    const { data, error } = await db
      .from('dentiste_pro_agenda')
      .select('date_heure, duree_minutes')
      .eq('cabinet_id', cabinetId)
      .gte('date_heure', debutJour)
      .lte('date_heure', finJour);

    if (!error && data) {
      for (const rdv of data) {
        const d = new Date(rdv.date_heure);
        const debutMin = d.getHours() * 60 + d.getMinutes();
        rdvs.push({
          debutMin,
          finMin: debutMin + (rdv.duree_minutes || 30)
        });
      }
    }
  } catch (e) {
    console.warn('[chat-patient-ia] Erreur lecture agenda:', e.message);
  }
  return rdvs;
}

// ===== Helper : sélectionner les meilleurs créneaux =====
function selectionnerMeilleurs(creneaux, nb) {
  if (creneaux.length <= nb) return creneaux;

  // Répartir : début, milieu, fin
  const result = [];
  const step = Math.floor(creneaux.length / nb);
  for (let i = 0; i < nb; i++) {
    result.push(creneaux[Math.min(i * step, creneaux.length - 1)]);
  }
  return result;
}

// ===== Helpers temps =====
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateFR(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  return d.toLocaleDateString('fr-FR', options);
}

// =========================================================
// POST /message — Message principal du chat IA
// Body: { text, audio_base64?, langue? }
// Retourne: { reply, action?, slots?, intent, entities }
// =========================================================
router.post('/message', requirePatient(), async (req, res) => {
  try {
    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;
    let { text, audio_base64, langue } = req.body || {};

    // Si audio fourni, transcrire d'abord
    if (audio_base64 && !text) {
      text = await transcrireAudio(audio_base64, langue);
      if (!text) {
        return res.status(400).json({ error: 'Impossible de transcrire l\'audio. Veuillez réessayer ou taper votre message.' });
      }
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Veuillez saisir un message.' });
    }

    text = text.trim();

    // === MODÉRATION ===
    const moderation = modererMessage(text);
    if (!moderation.ok) {
      await sauverMessage(cabinetId, patientId, 'patient', '[MODÉRÉ]', 'moderation', { texte_original: text });
      await sauverMessage(cabinetId, patientId, 'ia', moderation.reply, 'moderation', { niveau: moderation.niveau });
      return res.json({ reply: moderation.reply, intent: 'moderation', entities: {}, moderation: moderation.niveau });
    }

    // Sauvegarder le message du patient
    await sauverMessage(cabinetId, patientId, 'patient', text, null, null);

    // Charger l'historique récent pour le contexte (5 derniers messages)
    let historique = [];
    try {
      const db = admin();
      const { data } = await db
        .from('chat_patient_ia_messages')
        .select('role, content')
        .eq('patient_id', patientId)
        .eq('cabinet_id', cabinetId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        historique = data.reverse().map(m => ({
          role: m.role === 'patient' ? 'user' : 'assistant',
          content: m.content
        }));
      }
    } catch {
      // Pas bloquant
    }

    // Construire les messages pour DeepSeek
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historique,
      { role: 'user', content: text }
    ];

    // Appel IA
    const rawResponse = await callDeepSeek(messages);
    const parsed = parseIAResponse(rawResponse);

    // Sauvegarder la réponse IA
    await sauverMessage(cabinetId, patientId, 'ia', parsed.reply, parsed.intent, parsed.entities);

    // Construire la réponse avec action éventuelle
    const response = {
      reply: parsed.reply,
      intent: parsed.intent,
      entities: parsed.entities
    };

    // Si l'intention est RDV et qu'on a assez d'entités, chercher les créneaux
    if (parsed.intent === 'rdv' && parsed.entities.date && parsed.entities.acte) {
      const duree = getDureeActe(parsed.entities.acte);
      const preference = parsed.entities.heure === 'matin' ? 'matin' :
                         parsed.entities.heure === 'apres-midi' ? 'apres-midi' : null;

      const recherche = await calculerCreneauxDisponibles(cabinetId, parsed.entities.date, duree, preference);

      if (recherche.disponible) {
        response.action = 'proposer_creneaux';
        response.slots = recherche.creneaux.map((c, i) => ({
          id: `slot_${parsed.entities.date}_${c.debut}_${i}`,
          date: parsed.entities.date,
          heure_debut: c.debut,
          heure_fin: c.fin,
          duree_minutes: duree,
          periode: c.periode
        }));

        // Reformuler la réponse avec les créneaux
        const dateFormatee = formatDateFR(parsed.entities.date);
        const creneauxTexte = response.slots.map(s => `  - ${s.heure_debut} (${duree} min)`).join('\n');
        response.reply = `Voici les créneaux disponibles le ${dateFormatee} :\n${creneauxTexte}\nLequel vous convient ?`;

        // Mettre à jour le message IA en base
        await sauverMessage(cabinetId, patientId, 'ia', response.reply, 'rdv', parsed.entities);
      } else {
        response.reply = recherche.message + ' Souhaitez-vous essayer un autre jour ?';
      }
    }

    // Si l'intention est RDV mais qu'on a une heure précise (confirmation d'un créneau)
    if (parsed.intent === 'rdv' && parsed.entities.heure && /^\d{2}:\d{2}$/.test(parsed.entities.heure)) {
      response.action = 'confirmer_creneau';
    }

    // === URGENCE : inscrire en liste d'urgence + notifier ===
    if (parsed.intent === 'urgence') {
      const triage = {
        niveau: parsed.entities.urgence_niveau || 'semi-urgent',
        type: parsed.entities.urgence_type || 'douleur',
        enfant: parsed.entities.urgence_enfant || false
      };
      const inscription = await inscrireUrgence(cabinetId, patientId, triage, text);
      response.action = 'urgence_inscrite';
      response.urgence = {
        niveau: triage.niveau,
        type: triage.type,
        enfant: triage.enfant,
        inscrit_waitlist: inscription.success,
        score: inscription.score
      };
    }

    // Ajouter l'avertissement si warning modération
    if (moderation.niveau === 'avertissement') {
      response.avertissement = moderation.avertissement;
    }

    // Détecter la langue pour la réponse vocale côté client
    response.langue = parsed.entities.langue || langue || 'fr';

    res.json(response);
  } catch (e) {
    console.error('[chat-patient-ia] message:', e.message);
    res.status(500).json({ error: 'Erreur lors du traitement de votre message.' });
  }
});

// =========================================================
// POST /rdv/rechercher — Rechercher les créneaux disponibles
// Body: { date_souhaitee, creneau_souhaite, patient_id,
//         membre_id?, acte? }
// =========================================================
router.post('/rdv/rechercher', requirePatient(), async (req, res) => {
  try {
    const cabinetId = req.patient.cabinet_id;
    const { date_souhaitee, creneau_souhaite, acte } = req.body || {};

    if (!date_souhaitee) {
      return res.status(400).json({ error: 'La date souhaitée est obligatoire (format YYYY-MM-DD).' });
    }

    // Valider la date
    const dateObj = new Date(date_souhaitee + 'T12:00:00');
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ error: 'Format de date invalide. Utilisez le format YYYY-MM-DD.' });
    }

    // Vérifier que la date n'est pas dans le passé
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    if (dateObj < aujourdhui) {
      return res.status(400).json({ error: 'La date souhaitée ne peut pas être dans le passé.' });
    }

    // Déterminer la durée selon l'acte
    const duree = getDureeActe(acte);

    // Déterminer la préférence (matin/après-midi)
    let preference = null;
    if (creneau_souhaite) {
      const cs = creneau_souhaite.toLowerCase();
      if (cs.includes('matin')) preference = 'matin';
      else if (cs.includes('après-midi') || cs.includes('apres-midi') || cs.includes('aprem')) preference = 'apres-midi';
    }

    const resultat = await calculerCreneauxDisponibles(cabinetId, date_souhaitee, duree, preference);

    if (!resultat.disponible) {
      // Chercher le prochain jour disponible (jusqu'à 14 jours)
      let prochainJour = null;
      for (let i = 1; i <= 14; i++) {
        const d = new Date(dateObj);
        d.setDate(d.getDate() + i);
        if (d.getDay() === 0) continue; // Pas le dimanche
        const dStr = d.toISOString().slice(0, 10);
        const test = await calculerCreneauxDisponibles(cabinetId, dStr, duree, preference);
        if (test.disponible) {
          prochainJour = {
            date: dStr,
            jour: JOURS_SEMAINE[d.getDay()],
            creneaux: test.creneaux
          };
          break;
        }
      }

      return res.json({
        disponible: false,
        message: resultat.message,
        date_demandee: date_souhaitee,
        acte: acte || null,
        duree_minutes: duree,
        prochain_jour_disponible: prochainJour
      });
    }

    // Formater les slots pour le frontend
    const slots = resultat.creneaux.map((c, i) => ({
      id: `slot_${date_souhaitee}_${c.debut}_${i}`,
      date: date_souhaitee,
      jour: resultat.jour,
      heure_debut: c.debut,
      heure_fin: c.fin,
      duree_minutes: duree,
      periode: c.periode
    }));

    res.json({
      disponible: true,
      date: date_souhaitee,
      jour: resultat.jour,
      acte: acte || null,
      duree_minutes: duree,
      slots,
      total_disponibles: resultat.total_disponibles
    });
  } catch (e) {
    console.error('[chat-patient-ia] rdv/rechercher:', e.message);
    res.status(500).json({ error: 'Erreur lors de la recherche de créneaux.' });
  }
});

// =========================================================
// POST /rdv/confirmer — Confirmer et réserver un créneau
// Body: { slot_id, patient_id, membre_id?, acte? }
// =========================================================
router.post('/rdv/confirmer', requirePatient(), async (req, res) => {
  try {
    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;
    const { slot_id, membre_id, acte } = req.body || {};

    if (!slot_id) {
      return res.status(400).json({ error: 'L\'identifiant du créneau est obligatoire.' });
    }

    // Parser le slot_id pour extraire date et heure
    // Format : slot_YYYY-MM-DD_HH:MM_index
    const slotParts = slot_id.match(/^slot_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})_\d+$/);
    if (!slotParts) {
      return res.status(400).json({ error: 'Format de créneau invalide.' });
    }

    const dateRdv = slotParts[1];
    const heureRdv = slotParts[2];
    const duree = getDureeActe(acte);

    // Vérifier que le créneau est encore disponible (double check)
    const rdvExistants = await getRdvDuJour(cabinetId, dateRdv);
    const debutMin = timeToMinutes(heureRdv);
    const finMin = debutMin + duree;
    const conflit = rdvExistants.some(rdv => debutMin < rdv.finMin && finMin > rdv.debutMin);

    if (conflit) {
      return res.status(409).json({
        error: 'Ce créneau vient d\'être réservé par un autre patient. Veuillez en choisir un autre.',
        code: 'SLOT_TAKEN'
      });
    }

    // Charger les infos du patient
    let patientInfo = { nom: 'Patient', prenom: '' };
    try {
      const db = admin();
      const { data } = await db
        .from('dentiste_pro_patients')
        .select('nom, prenom, telephone, email')
        .eq('id', patientId)
        .maybeSingle();

      if (data) patientInfo = data;
    } catch {
      // Pas bloquant
    }

    // Créer le RDV dans dentiste_pro_agenda
    const dateHeure = new Date(`${dateRdv}T${heureRdv}:00`).toISOString();
    const rdvData = {
      cabinet_id: cabinetId,
      patient_nom: patientInfo.nom,
      patient_prenom: patientInfo.prenom || '',
      patient_tel: patientInfo.telephone || null,
      patient_email: patientInfo.email || null,
      date_heure: dateHeure,
      duree_minutes: duree,
      categorie: 'consultation',
      acte: acte || 'premiere_consultation',
      type: 'consultation',
      notes: 'Pris via chat IA JADOMI',
      source: 'chat_ia',
      patient_id: patientId,
      membre_id: membre_id || null,
      created_at: new Date().toISOString()
    };

    let rdvCree = null;
    try {
      const db = admin();
      const { data, error } = await db
        .from('dentiste_pro_agenda')
        .insert(rdvData)
        .select()
        .single();

      if (error) throw error;
      rdvCree = data;
    } catch (e) {
      console.error('[chat-patient-ia] Création RDV échouée:', e.message);
      return res.status(500).json({ error: 'Impossible de réserver le créneau. Veuillez réessayer.' });
    }

    // Formater la confirmation
    const dateFormatee = formatDateFR(dateRdv);
    const confirmation = `Votre rendez-vous est confirmé : ${dateFormatee} à ${heureRdv} pour une durée de ${duree} minutes. Vous recevrez un rappel la veille. A bientôt !`;

    // Sauvegarder le message de confirmation
    await sauverMessage(cabinetId, patientId, 'ia', confirmation, 'rdv_confirme', {
      date: dateRdv,
      heure: heureRdv,
      acte: acte || 'premiere_consultation',
      rdv_id: rdvCree?.id
    });

    res.json({
      success: true,
      message: confirmation,
      rdv: {
        id: rdvCree?.id,
        date: dateRdv,
        heure: heureRdv,
        duree_minutes: duree,
        acte: acte || 'premiere_consultation',
        patient_nom: patientInfo.nom,
        patient_prenom: patientInfo.prenom || ''
      }
    });
  } catch (e) {
    console.error('[chat-patient-ia] rdv/confirmer:', e.message);
    res.status(500).json({ error: 'Erreur lors de la confirmation du rendez-vous.' });
  }
});

// =========================================================
// GET /historique — Historique des messages IA du patient
// Query: page (défaut 1), limit (défaut 20)
// =========================================================
router.get('/historique', requirePatient(), async (req, res) => {
  try {
    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const db = admin();

    // Compter le total
    const { count, error: countErr } = await db
      .from('chat_patient_ia_messages')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('cabinet_id', cabinetId);

    if (countErr) {
      // Table n'existe peut-être pas encore
      if (countErr.code === '42P01') {
        return res.json({ messages: [], total: 0, page, limit, total_pages: 0 });
      }
      throw countErr;
    }

    // Charger les messages paginés
    const { data, error } = await db
      .from('chat_patient_ia_messages')
      .select('id, role, content, intent, entities, created_at')
      .eq('patient_id', patientId)
      .eq('cabinet_id', cabinetId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
      messages: data || [],
      total,
      page,
      limit,
      total_pages: totalPages
    });
  } catch (e) {
    console.error('[chat-patient-ia] historique:', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement de l\'historique.' });
  }
});

// =========================================================
// POST /transcription — Transcription audio vers texte
// Body: { audio_base64, langue? }
// Pas d'auth requise pour la V1 (anonyme)
// =========================================================
router.post('/transcription', async (req, res) => {
  try {
    const { audio_base64, langue } = req.body || {};

    if (!audio_base64) {
      return res.status(400).json({ error: 'Le champ audio_base64 est obligatoire.' });
    }

    const texte = await transcrireAudio(audio_base64, langue);

    if (!texte) {
      return res.status(422).json({ error: 'Impossible de transcrire l\'audio. Vérifiez le format et la qualité de l\'enregistrement.' });
    }

    res.json({
      texte,
      langue_detectee: langue || 'auto',
      source: 'transcription_ia'
    });
  } catch (e) {
    console.error('[chat-patient-ia] transcription:', e.message);
    res.status(500).json({ error: 'Erreur lors de la transcription.' });
  }
});

// ===== Fonction de transcription audio =====
async function transcrireAudio(audioBase64, langue) {
  // Essayer Whisper (OpenAI) si clé disponible
  const whisperKey = process.env.OPENAI_API_KEY;
  if (whisperKey) {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const FormData = (await import('form-data')).default || require('form-data');
      const form = new FormData();
      form.append('file', audioBuffer, { filename: 'audio.webm', contentType: 'audio/webm' });
      form.append('model', 'whisper-1');
      if (langue) form.append('language', langue);

      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + whisperKey,
          ...form.getHeaders()
        },
        body: form
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.text || null;
      }
      console.warn('[chat-patient-ia] Whisper HTTP', resp.status);
    } catch (e) {
      console.warn('[chat-patient-ia] Whisper error:', e.message);
    }
  }

  // Fallback : DeepSeek ne supporte pas la transcription audio
  // Retourner null — la transcription se fera côté client (Web Speech API)
  console.warn('[chat-patient-ia] Aucun service de transcription disponible. Utilisez Web Speech API côté client.');
  return null;
}

// =========================================================
// POST /photo — Le patient envoie une photo/document
// Body (multipart): photo + description?
// Stocke le document et notifie le dentiste
// =========================================================
const multer = require('multer');
const path = require('path');

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/patient-docs')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `patdoc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|application)\/(jpeg|jpg|png|webp|heic|pdf)$/i;
    cb(null, ok.test(file.mimetype));
  }
});

router.post('/photo', requirePatient(), uploadPhoto.single('photo'), async (req, res) => {
  try {
    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;
    const { description, type_document } = req.body || {};

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier envoyé.' });
    }

    const photoUrl = '/uploads/patient-docs/' + req.file.filename;
    const typeDoc = type_document || 'autre';
    const typesValides = ['radio', 'devis_mutuelle', 'courrier_specialiste', 'ordonnance', 'photo_dentaire', 'autre'];

    // Sauver dans le chat IA
    const contenu = `[Document envoyé : ${typesValides.includes(typeDoc) ? typeDoc.replace(/_/g, ' ') : 'document'}]${description ? ' — ' + description : ''}`;
    await sauverMessage(cabinetId, patientId, 'patient', contenu, 'photo', {
      photo_url: photoUrl,
      type_document: typeDoc,
      description: description || null,
      filename: req.file.originalname
    });

    // Réponse IA
    const replyMap = {
      'radio': 'Votre radiographie a bien été reçue. Le praticien la consultera avant votre prochain rendez-vous.',
      'devis_mutuelle': 'Votre réponse de devis mutuelle a bien été reçue. Le cabinet en prendra connaissance.',
      'courrier_specialiste': 'Le courrier du spécialiste a bien été transmis au praticien.',
      'ordonnance': 'Votre ordonnance a bien été enregistrée.',
      'photo_dentaire': 'Votre photo a bien été reçue. Le praticien la consultera.',
      'autre': 'Votre document a bien été reçu et transmis au cabinet.'
    };
    const reply = replyMap[typeDoc] || replyMap['autre'];

    await sauverMessage(cabinetId, patientId, 'ia', reply, 'photo', { type_document: typeDoc });

    res.json({ reply, intent: 'photo', photo_url: photoUrl, langue: 'fr' });
  } catch (e) {
    console.error('[chat-patient-ia] photo:', e.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du document.' });
  }
});

// =========================================================
// GET /resume-rdv/:rdvId — Résumé pré-RDV pour le dentiste
// Ce que le patient a dit, soins à prévoir, documents envoyés
// =========================================================
router.get('/resume-rdv/:rdvId', async (req, res) => {
  try {
    const { rdvId } = req.params;

    // Charger le RDV
    const db = admin();
    const { data: rdv } = await db
      .from('dentiste_pro_agenda')
      .select('*')
      .eq('id', rdvId)
      .maybeSingle();

    if (!rdv) return res.status(404).json({ error: 'RDV non trouvé' });

    // Trouver le patient par téléphone
    const { data: patient } = await db
      .from('dentiste_pro_patients')
      .select('id, nom, prenom, telephone')
      .or(`telephone.eq.${rdv.patient_tel},nom.eq.${rdv.patient_nom}`)
      .maybeSingle();

    if (!patient) {
      return res.json({
        rdv_id: rdvId,
        resume: 'Aucun échange IA trouvé pour ce patient.',
        documents: [],
        motif: rdv.acte || rdv.type || null
      });
    }

    // Charger les messages IA récents du patient (30 derniers jours)
    const depuisDate = new Date();
    depuisDate.setDate(depuisDate.getDate() - 30);

    const { data: messages } = await db
      .from('chat_patient_ia_messages')
      .select('role, content, intent, entities, created_at')
      .eq('patient_id', patient.id)
      .eq('cabinet_id', rdv.cabinet_id)
      .gte('created_at', depuisDate.toISOString())
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      return res.json({
        rdv_id: rdvId,
        patient: { nom: patient.nom, prenom: patient.prenom },
        resume: 'Aucun échange IA récent.',
        documents: [],
        motif: rdv.acte || rdv.type || null
      });
    }

    // Extraire les documents envoyés
    const documents = messages
      .filter(m => m.intent === 'photo' && m.role === 'patient')
      .map(m => ({
        type: m.entities?.type_document || 'autre',
        description: m.entities?.description || null,
        url: m.entities?.photo_url || null,
        date: m.created_at
      }));

    // Extraire ce que le patient a dit (messages patient uniquement)
    const motifs = messages
      .filter(m => m.role === 'patient' && m.intent !== 'moderation')
      .map(m => m.content)
      .filter(c => c && !c.startsWith('['));

    // Construire le résumé
    const soinsAPrévoir = rdv.acte || rdv.actes?.join(', ') || rdv.type || 'Non précisé';
    const resume = {
      rdv_id: rdvId,
      patient: { nom: patient.nom, prenom: patient.prenom, telephone: patient.telephone },
      date_rdv: rdv.date_heure,
      soins_prevus: soinsAPrévoir,
      duree_prevue: rdv.duree_minutes + ' min',
      ce_que_le_patient_a_dit: motifs.slice(-10),
      documents_envoyes: documents,
      nombre_echanges: messages.length,
      derniere_interaction: messages[messages.length - 1]?.created_at
    };

    res.json(resume);
  } catch (e) {
    console.error('[chat-patient-ia] resume-rdv:', e.message);
    res.status(500).json({ error: 'Erreur chargement résumé' });
  }
});

// =========================================================
// GET /famille — Liste des membres de la famille du patient
// POST /famille — Ajouter un membre
// DELETE /famille/:id — Supprimer un membre
// =========================================================
router.get('/famille', requirePatient(), async (req, res) => {
  try {
    const db = admin();
    const { data, error } = await db
      .from('patient_famille_membres')
      .select('*')
      .eq('patient_principal_id', req.patient.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ membres: data || [] });
  } catch (e) {
    console.error('[chat-patient-ia] famille list:', e.message);
    res.status(500).json({ error: 'Erreur chargement famille' });
  }
});

router.post('/famille', requirePatient(), async (req, res) => {
  try {
    const { nom, prenom, date_naissance, lien } = req.body || {};
    if (!nom || !prenom) {
      return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires.' });
    }

    const db = admin();
    const { data, error } = await db
      .from('patient_famille_membres')
      .insert({
        patient_principal_id: req.patient.id,
        nom: nom.trim(),
        prenom: prenom.trim(),
        date_naissance: date_naissance || null,
        lien: ['conjoint', 'enfant', 'parent', 'autre'].includes(lien) ? lien : 'autre'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ membre: data });
  } catch (e) {
    console.error('[chat-patient-ia] famille add:', e.message);
    res.status(500).json({ error: 'Erreur ajout membre' });
  }
});

router.delete('/famille/:id', requirePatient(), async (req, res) => {
  try {
    const db = admin();
    const { error } = await db
      .from('patient_famille_membres')
      .delete()
      .eq('id', req.params.id)
      .eq('patient_principal_id', req.patient.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[chat-patient-ia] famille delete:', e.message);
    res.status(500).json({ error: 'Erreur suppression membre' });
  }
});

module.exports = router;
