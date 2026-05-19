// =============================================
// JADOMI — Agent Patient
//
// Spécialisé dans le suivi patient :
// - Recherche et résumé patient complet
// - Détection de patient dans un mail
// - Résumé pré-consultation
// - Actions en attente (suivi, devis, traitements)
//
// Cascade IA : regex local (0EUR) → Mistral si besoin
// REGLE : JAMAIS de conseil médical, renvoyer vers praticien
// =============================================

const { mistralGenerate } = require('../ia-router');
const { validateResponse } = require('../ai-studio/jadomi-brain');

// Import prudent de memory.js (créé par un autre builder)
let memory = null;
try {
  memory = require('./memory');
} catch (_e) {
  // memory.js pas encore disponible — on continue sans
}

// ═══════════════════════════════════════
// PATTERNS LOCAUX — Détection patient/intention (0EUR)
// ═══════════════════════════════════════

const INTENT_PATTERNS = {
  cancel: [
    /\bannul(e|é|er|ation)\b/i,
    /\breport(e|é|er)\b/i,
    /\bemp[eê]ch(e|é|er)\b/i,
    /\bplus\s+venir\b/i,
    /\bd[eé]command(e|é|er)\b/i
  ],
  confirm: [
    /\bconfirm(e|é|er|ation)\b/i,
    /\bserai?\s+(présent|là)\b/i,
    /\bc'est\s+(bon|ok|noté)\b/i,
    /\bje\s+viens\b/i
  ],
  question: [
    /\bquestion\b/i,
    /\brenseignement\b/i,
    /\binformation\b/i,
    /\bcomment\b/i,
    /\best[\s-]ce\s+que\b/i,
    /\bpourriez[\s-]vous\b/i,
    /\bje\s+voudrais\s+savoir\b/i
  ],
  document: [
    /\bordonnance\b/i,
    /\bcertificat\b/i,
    /\battestation\b/i,
    /\bfacture\b/i,
    /\bdevis\b/i,
    /\bdocument\b/i,
    /\bradiographie\b/i,
    /\bradio\b/i,
    /\bcompte[\s-]rendu\b/i,
    /\bletter?e\b/i
  ],
  urgency: [
    /\burgent\b/i,
    /\bdouleur\b/i,
    /\bmal\s+(de\s+)?dent/i,
    /\bgonflement\b/i,
    /\bsaignement\b/i,
    /\bcassé\b/i,
    /\btombé\b/i,
    /\babs?cès\b/i
  ]
};

// ═══════════════════════════════════════
// FONCTION 1 : getPatientSummary
// Recherche un patient et retourne son historique
// ═══════════════════════════════════════

async function getPatientSummary(supabase, societeId, { name, phone, email } = {}) {
  try {
    if (!name && !phone && !email) {
      return { success: false, error: 'Au moins un critère de recherche requis (nom, téléphone ou email)' };
    }

    // Charger le contexte agent si memory disponible
    if (memory && typeof memory.buildAgentContext === 'function') {
      try {
        await memory.buildAgentContext(supabase, societeId, 'patient');
      } catch (_e) { /* ignore */ }
    }

    // Recherche du patient
    let query = supabase
      .from('patients')
      .select('*')
      .eq('societe_id', societeId);

    if (email) {
      query = query.ilike('email', `%${email}%`);
    } else if (phone) {
      // Normaliser le téléphone (retirer espaces, points, tirets)
      const cleanPhone = phone.replace(/[\s.\-()]/g, '');
      query = query.or(`telephone.ilike.%${cleanPhone}%,tel.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone}%`);
    } else if (name) {
      // Recherche souple sur le nom
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        query = query.or(`nom.ilike.%${parts[0]}%,prenom.ilike.%${parts[0]}%,nom.ilike.%${parts[1]}%,prenom.ilike.%${parts[1]}%`);
      } else {
        query = query.or(`nom.ilike.%${name}%,prenom.ilike.%${name}%,patient_name.ilike.%${name}%`);
      }
    }

    const { data: patients, error } = await query.limit(5);

    if (error) {
      console.error('[AGENT:PATIENT] getPatientSummary DB error:', error.message);
      return { success: false, error: 'Erreur de recherche patient' };
    }

    if (!patients || patients.length === 0) {
      return {
        success: true,
        found: false,
        patient: null,
        message: `Aucun patient trouvé pour ${name || phone || email}.`
      };
    }

    const patient = patients[0];
    const patientId = patient.id;

    // Charger l'historique des RDV
    let history = [];
    try {
      const { data: rdvs } = await supabase
        .from('rdv')
        .select('*')
        .eq('societe_id', societeId)
        .or(`patient_id.eq.${patientId},patient_name.ilike.%${patient.nom || patient.prenom || ''}%`)
        .order('date_heure', { ascending: false })
        .limit(20);
      history = rdvs || [];
    } catch (_e) { /* table rdv peut ne pas avoir patient_id */ }

    // RDV à venir
    const now = new Date().toISOString();
    const upcomingRdvs = history.filter(r => r.date_heure && r.date_heure > now);
    const pastRdvs = history.filter(r => r.date_heure && r.date_heure <= now);

    return {
      success: true,
      found: true,
      multiple_matches: patients.length > 1,
      patient: {
        id: patient.id,
        nom: patient.nom || patient.name,
        prenom: patient.prenom || patient.first_name,
        email: patient.email,
        telephone: patient.telephone || patient.tel || patient.phone,
        date_naissance: patient.date_naissance || patient.birthdate,
        adresse: patient.adresse || patient.address,
        notes: patient.notes || patient.remarques,
        allergies: patient.allergies,
        created_at: patient.created_at
      },
      history: pastRdvs.slice(0, 10).map(r => ({
        date: r.date_heure,
        acte: r.acte || r.motif || r.type,
        duration: r.duree,
        status: r.status || r.statut,
        notes: r.notes
      })),
      upcoming_rdvs: upcomingRdvs.map(r => ({
        id: r.id,
        date: r.date_heure,
        acte: r.acte || r.motif || r.type,
        status: r.status || r.statut
      })),
      total_visits: pastRdvs.length,
      last_visit: pastRdvs.length > 0 ? pastRdvs[0].date_heure : null,
      documents: [] // Placeholder — sera enrichi quand le module documents existera
    };
  } catch (err) {
    console.error('[AGENT:PATIENT] getPatientSummary error:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 2 : detectPatientInMail
// Détecte un patient et son intention dans un mail
// ═══════════════════════════════════════

async function detectPatientInMail(mail) {
  try {
    const text = [
      mail.subject || '',
      mail.text || mail.body_preview || '',
      mail.fromName || ''
    ].join(' ');

    // Détection de l'intention par regex local (0EUR)
    let intent = 'other';
    let intentConfidence = 'low';

    for (const [intentName, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        intent = intentName;
        intentConfidence = 'high';
        break;
      }
    }

    // Extraction du nom patient
    let patientName = mail.fromName || null;
    let hasPatient = false;

    // Si le mail vient de Doctolib, extraire le nom du sujet
    if ((mail.from || mail.from_address || '').includes('doctolib')) {
      const doctolibMatch = text.match(/(?:Mme|Mlle|M\.|Mr|Dr|Monsieur|Madame)\s+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)*)/);
      if (doctolibMatch) {
        patientName = doctolibMatch[1];
        hasPatient = true;
      }
    }

    // Détection de noms dans le texte
    if (!hasPatient) {
      // Pattern : Mme/M./Dr + Nom
      const nameMatch = text.match(/(?:Mme|Mlle|M\.|Mr|Monsieur|Madame|patient(?:e)?)\s+([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü][a-zà-ü]+)*)/);
      if (nameMatch) {
        patientName = nameMatch[1];
        hasPatient = true;
      }
    }

    // Si on a un from qui ressemble à un patient (pas un fournisseur/labo connu)
    if (!hasPatient && patientName) {
      const fromDomain = (mail.from || mail.from_address || '').split('@')[1] || '';
      const isPersonal = ['gmail.com', 'yahoo.fr', 'hotmail.fr', 'hotmail.com', 'orange.fr',
        'free.fr', 'sfr.fr', 'laposte.net', 'wanadoo.fr', 'outlook.fr', 'outlook.com',
        'icloud.com', 'live.fr', 'bbox.fr', 'numericable.fr'].includes(fromDomain.toLowerCase());
      if (isPersonal) {
        hasPatient = true;
      }
    }

    // Si l'intention est médicale, c'est forcément un patient
    if (['cancel', 'confirm', 'urgency'].includes(intent)) {
      hasPatient = true;
    }

    // Si pas assez d'indices, tenter Mistral pour qualifier
    if (!hasPatient && intent === 'other') {
      try {
        const prompt = `Ce mail concerne-t-il un patient ? Réponds UNIQUEMENT "oui" ou "non".\n\nDe: ${mail.from || mail.from_address}\nObjet: ${mail.subject || ''}\nExtrait: ${(mail.text || mail.body_preview || '').substring(0, 200)}`;
        const result = await mistralGenerate(
          'Tu es un classifieur médical. Réponds UNIQUEMENT "oui" ou "non".',
          prompt,
          { maxTokens: 10, temperature: 0.0 }
        );
        if ((result || '').toLowerCase().includes('oui')) {
          hasPatient = true;
          intentConfidence = 'medium';
        }
      } catch (_e) { /* pas grave */ }
    }

    return {
      hasPatient,
      patientName,
      intent,
      intentConfidence,
      isUrgent: intent === 'urgency'
    };
  } catch (err) {
    console.error('[AGENT:PATIENT] detectPatientInMail error:', err.message);
    return { hasPatient: false, patientName: null, intent: 'other', error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 3 : generatePreVisitSummary
// Résumé pré-consultation pour le praticien
// ═══════════════════════════════════════

async function generatePreVisitSummary(supabase, societeId, rdvId) {
  try {
    // Charger le RDV
    const { data: rdv, error: rdvError } = await supabase
      .from('rdv')
      .select('*')
      .eq('id', rdvId)
      .eq('societe_id', societeId)
      .single();

    if (rdvError || !rdv) {
      return { success: false, error: 'Rendez-vous non trouvé' };
    }

    // Charger le patient
    const patientName = rdv.patient_name || rdv.patient_nom;
    const patientId = rdv.patient_id;

    let patient = null;
    if (patientId) {
      const { data: p } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      patient = p;
    } else if (patientName) {
      // Recherche par nom
      const result = await getPatientSummary(supabase, societeId, { name: patientName });
      if (result.found) {
        patient = result.patient;
      }
    }

    // Historique des derniers soins
    let lastVisits = [];
    if (patientId || patientName) {
      let hQuery = supabase
        .from('rdv')
        .select('date_heure, acte, motif, type, notes, duree, status, statut')
        .eq('societe_id', societeId)
        .lt('date_heure', new Date().toISOString())
        .order('date_heure', { ascending: false })
        .limit(5);

      if (patientId) {
        hQuery = hQuery.eq('patient_id', patientId);
      } else {
        hQuery = hQuery.ilike('patient_name', `%${patientName}%`);
      }

      const { data: visits } = await hQuery;
      lastVisits = visits || [];
    }

    // Construire le résumé
    const alerts = [];

    // Alertes médicales
    if (patient && patient.allergies) {
      alerts.push({ type: 'allergy', message: `Allergies : ${patient.allergies}`, severity: 'high' });
    }
    if (patient && patient.notes) {
      alerts.push({ type: 'note', message: patient.notes, severity: 'info' });
    }

    // Nouveau patient ?
    const isNew = !patient || lastVisits.length === 0;
    if (isNew) {
      alerts.push({ type: 'new_patient', message: 'Premier rendez-vous, aucun historique connu.', severity: 'info' });
    }

    // Acte du jour
    const acteToday = rdv.acte || rdv.motif || rdv.type || 'Non précisé';

    // Générer un résumé textuel via Mistral si on a assez de données
    let summaryText = null;
    if (lastVisits.length > 0) {
      try {
        const historyStr = lastVisits.map(v =>
          `${(v.date_heure || '').substring(0, 10)} : ${v.acte || v.motif || v.type || 'non précisé'}`
        ).join('\n');

        const prompt = `Génère un résumé pré-consultation en 3-4 phrases pour un dentiste.\n\nPatient : ${patientName || 'inconnu'}\nActe prévu : ${acteToday}\nHistorique récent :\n${historyStr}\n${patient && patient.allergies ? `Allergies : ${patient.allergies}` : ''}\n\nRéponds UNIQUEMENT avec le résumé, en vouvoyant le praticien. Pas de conseil médical.`;

        summaryText = await mistralGenerate(
          'Tu es un assistant de cabinet dentaire. Tu résumes l\'historique patient pour le praticien. JAMAIS de conseil médical. Vouvoiement obligatoire.',
          prompt,
          { maxTokens: 200, temperature: 0.2 }
        );

        // Valider la réponse
        try {
          validateResponse(summaryText);
        } catch (_e) { /* pas bloquant */ }
      } catch (_e) {
        // Fallback sans IA
        summaryText = `Patient ${patientName || 'inconnu'}, ${lastVisits.length} visite(s) précédente(s). Dernier soin : ${lastVisits[0] ? (lastVisits[0].acte || lastVisits[0].motif || 'non précisé') : 'inconnu'}.`;
      }
    }

    return {
      success: true,
      rdv: {
        id: rdv.id,
        date: rdv.date_heure,
        acte: acteToday,
        duration: rdv.duree || 30
      },
      patient: patient ? {
        nom: patient.nom || patient.name,
        prenom: patient.prenom || patient.first_name,
        age: patient.date_naissance ? Math.floor((new Date() - new Date(patient.date_naissance)) / 31557600000) : null,
        allergies: patient.allergies || null,
        telephone: patient.telephone || patient.tel || patient.phone
      } : null,
      is_new_patient: isNew,
      last_visits: lastVisits.map(v => ({
        date: (v.date_heure || '').substring(0, 10),
        acte: v.acte || v.motif || v.type,
        notes: v.notes
      })),
      alerts,
      summary: summaryText || `Rendez-vous prévu pour ${patientName || 'patient inconnu'}. Acte : ${acteToday}.${isNew ? ' Premier rendez-vous.' : ''}`
    };
  } catch (err) {
    console.error('[AGENT:PATIENT] generatePreVisitSummary error:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 4 : listPendingActions
// Patients en attente d'actions
// ═══════════════════════════════════════

async function listPendingActions(supabase, societeId) {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const actions = [];

    // 1. Patients sans RDV futur qui ont consulté récemment
    try {
      // Récupérer les patients qui ont eu un RDV dans les 6 derniers mois
      const { data: recentRdvs } = await supabase
        .from('rdv')
        .select('patient_name, patient_nom, patient_id, patient_email, patient_phone, patient_tel, date_heure, acte, motif, notes')
        .eq('societe_id', societeId)
        .gte('date_heure', sixMonthsAgo.toISOString())
        .lte('date_heure', now.toISOString())
        .order('date_heure', { ascending: false });

      const recent = recentRdvs || [];

      // Récupérer les RDV futurs pour vérifier qui n'a pas de prochain RDV
      const { data: futureRdvs } = await supabase
        .from('rdv')
        .select('patient_name, patient_nom, patient_id')
        .eq('societe_id', societeId)
        .gt('date_heure', now.toISOString());

      const futurePatients = new Set();
      for (const r of (futureRdvs || [])) {
        const key = r.patient_id || (r.patient_name || r.patient_nom || '').toLowerCase();
        if (key) futurePatients.add(key);
      }

      // Déduplication par patient
      const seen = new Set();
      for (const r of recent) {
        const patientKey = r.patient_id || (r.patient_name || r.patient_nom || '').toLowerCase();
        if (!patientKey || seen.has(patientKey)) continue;
        seen.add(patientKey);

        // Vérifier si pas de RDV futur
        if (!futurePatients.has(patientKey)) {
          const lastDate = new Date(r.date_heure);
          const daysSince = Math.round((now - lastDate) / 86400000);

          // Seulement les patients vus il y a plus de 30 jours (éviter faux positifs)
          if (daysSince > 30) {
            actions.push({
              type: 'no_followup',
              patient_name: r.patient_name || r.patient_nom,
              patient_id: r.patient_id,
              patient_email: r.patient_email,
              patient_phone: r.patient_phone || r.patient_tel,
              last_visit: r.date_heure,
              days_since: daysSince,
              last_acte: r.acte || r.motif,
              priority: daysSince > 180 ? 'high' : daysSince > 90 ? 'medium' : 'low',
              message: `${r.patient_name || r.patient_nom} : dernière visite il y a ${daysSince} jours, aucun prochain RDV programmé.`
            });
          }
        }
      }
    } catch (_e) {
      // Table ou colonnes pas encore disponibles
    }

    // 2. RDV annulés non reprogrammés (dans les 3 derniers mois)
    try {
      const { data: cancelledRdvs } = await supabase
        .from('rdv')
        .select('patient_name, patient_nom, patient_id, date_heure, acte, motif')
        .eq('societe_id', societeId)
        .gte('date_heure', threeMonthsAgo.toISOString())
        .in('status', ['cancelled', 'annule', 'annulé'])
        .order('date_heure', { ascending: false })
        .limit(50);

      for (const r of (cancelledRdvs || [])) {
        actions.push({
          type: 'cancelled_not_rescheduled',
          patient_name: r.patient_name || r.patient_nom,
          patient_id: r.patient_id,
          original_date: r.date_heure,
          acte: r.acte || r.motif,
          priority: 'medium',
          message: `RDV annulé non reprogrammé : ${r.patient_name || r.patient_nom}, acte : ${r.acte || r.motif || 'non précisé'}.`
        });
      }
    } catch (_e) {
      // Colonne status peut ne pas exister
    }

    // Trier par priorité puis par date
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    actions.sort((a, b) => {
      const pa = priorityOrder[a.priority] || 3;
      const pb = priorityOrder[b.priority] || 3;
      if (pa !== pb) return pa - pb;
      return (b.days_since || 0) - (a.days_since || 0);
    });

    return {
      success: true,
      actions,
      total_actions: actions.length,
      high_priority: actions.filter(a => a.priority === 'high').length,
      medium_priority: actions.filter(a => a.priority === 'medium').length,
      low_priority: actions.filter(a => a.priority === 'low').length,
      summary: actions.length > 0
        ? `${actions.length} action(s) en attente : ${actions.filter(a => a.priority === 'high').length} urgente(s), ${actions.filter(a => a.priority === 'medium').length} moyenne(s).`
        : 'Aucune action en attente. Tous les patients sont à jour.'
    };
  } catch (err) {
    console.error('[AGENT:PATIENT] listPendingActions error:', err.message);
    return { success: false, actions: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════

module.exports = {
  getPatientSummary,
  detectPatientInMail,
  generatePreVisitSummary,
  listPendingActions
};
