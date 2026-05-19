// =============================================
// JADOMI — Agent Agenda/RDV
//
// Spécialisé dans la gestion des rendez-vous :
// - Détection d'annulations dans les mails
// - Proposition d'annulation (jamais auto)
// - Recherche de créneaux de remplacement
// - Optimisation du planning quotidien
// - Résumé des RDV à venir avec alertes
//
// Cascade IA : regex local (0EUR) → Mistral si besoin
// REGLE ABSOLUE : JAMAIS annuler sans validation praticien
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
// PATTERNS LOCAUX — Détection annulation (0EUR)
// ═══════════════════════════════════════

const CANCEL_PATTERNS = [
  /\bannul(e|é|er|ation|ons|ez)\b/i,
  /\breport(e|é|er|ons|ez)\b/i,
  /\bemp[eê]ch(e|é|er|ement)\b/i,
  /\bplus\s+venir\b/i,
  /\bd[eé]command(e|é|er)\b/i,
  /\bne\s+(pourr|peut|peux)\w*\s+(pas\s+)?(venir|se\s+rendre|se\s+présenter)\b/i,
  /\bimpossible\s+de\s+(venir|se\s+rendre|se\s+présenter)\b/i,
  /\bsouhaite\s+(annul|report|décal)\w*/i,
  /\bd[eé]placer\s+(le|mon|son)\s+r(dv|endez)/i,
  /\bcontretemps\b/i,
  /\bimpr[eé]vu\b/i
];

const CONFIRM_PATTERNS = [
  /\bconfirm(e|é|er|ation|ons|ez)\b/i,
  /\bserai?\s+(présent|là|disponible)\b/i,
  /\bje\s+viens\b/i,
  /\bc'est\s+(bon|ok|noté)\b/i
];

const DATE_PATTERN = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
const TIME_PATTERN = /(\d{1,2})\s*[hH:]\s*(\d{0,2})/;

// ═══════════════════════════════════════
// FONCTION 1 : detectCancellation
// Détecte si un mail contient une annulation
// ═══════════════════════════════════════

async function detectCancellation(mail) {
  try {
    const text = [
      mail.subject || '',
      mail.text || mail.body_preview || '',
      mail.fromName || ''
    ].join(' ');

    const lower = text.toLowerCase();

    // Détection locale par regex (0EUR)
    const isCancellation = CANCEL_PATTERNS.some(p => p.test(text));
    const isConfirmation = CONFIRM_PATTERNS.some(p => p.test(text));

    // Si confirmation détectée et pas d'annulation, c'est pas une annulation
    if (isConfirmation && !isCancellation) {
      return { isCancellation: false, isConfirmation: true, patientName: null, date: null, reason: null };
    }

    if (!isCancellation) {
      return { isCancellation: false, isConfirmation: false, patientName: null, date: null, reason: null };
    }

    // Extraction de la date
    let date = null;
    const dateMatch = text.match(DATE_PATTERN);
    if (dateMatch) {
      const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
      date = `${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }

    // Extraction de l'heure
    let time = null;
    const timeMatch = text.match(TIME_PATTERN);
    if (timeMatch) {
      time = `${timeMatch[1].padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}`;
    }

    // Extraction du nom patient — on utilise Mistral uniquement si nécessaire
    let patientName = mail.fromName || null;

    // Si pas de nom exploitable, essayer Mistral
    if (!patientName || patientName.length < 2) {
      try {
        const prompt = `Extrais le nom du patient depuis ce mail d'annulation de RDV. Réponds UNIQUEMENT avec le nom (prénom + nom) ou "inconnu" si pas trouvé.\n\nDe: ${mail.from || mail.from_address}\nObjet: ${mail.subject || ''}\nExtrait: ${(mail.text || mail.body_preview || '').substring(0, 300)}`;
        const result = await mistralGenerate(
          'Tu es un extracteur de noms. Réponds UNIQUEMENT avec le nom ou "inconnu".',
          prompt,
          { maxTokens: 50, temperature: 0.0 }
        );
        const cleaned = (result || '').trim().replace(/["\n]/g, '');
        if (cleaned && cleaned.toLowerCase() !== 'inconnu' && cleaned.length > 1 && cleaned.length < 80) {
          patientName = cleaned;
        }
      } catch (_e) {
        // Pas grave, on continue sans nom précis
      }
    }

    // Extraction de la raison
    let reason = null;
    const reasonPatterns = [
      /(?:raison|motif|car|parce\s+que|cause)\s*[:=]?\s*(.{5,80})/i,
      /(?:je\s+suis|étant)\s+(malade|souffrant|hospitalisé|absent|indisponible)/i,
      /(?:urgence|voyage|déplacement|travail|maladie|hospitalisation)/i
    ];
    for (const rp of reasonPatterns) {
      const rm = text.match(rp);
      if (rm) {
        reason = rm[1] || rm[0];
        break;
      }
    }

    return {
      isCancellation: true,
      isConfirmation: false,
      patientName,
      date,
      time,
      reason,
      confidence: date ? 'high' : 'medium'
    };
  } catch (err) {
    console.error('[AGENT:AGENDA] detectCancellation error:', err.message);
    return { isCancellation: false, patientName: null, date: null, reason: null, error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 2 : cancelProposal
// Propose une annulation (JAMAIS auto)
// ═══════════════════════════════════════

async function cancelProposal(supabase, societeId, cancellationData) {
  try {
    // Charger le contexte agent si memory disponible
    let agentContext = {};
    if (memory && typeof memory.buildAgentContext === 'function') {
      try {
        agentContext = await memory.buildAgentContext(supabase, societeId, 'agenda');
      } catch (_e) { /* ignore */ }
    }

    const { patientName, date, time, reason } = cancellationData;

    // Recherche du RDV dans la base
    let query = supabase
      .from('rdv')
      .select('*')
      .eq('societe_id', societeId);

    if (date) {
      query = query.gte('date_heure', `${date}T00:00:00`)
                   .lte('date_heure', `${date}T23:59:59`);
    }

    const { data: rdvs, error } = await query.order('date_heure', { ascending: true });

    if (error) {
      console.error('[AGENT:AGENDA] cancelProposal DB error:', error.message);
      return { success: false, error: 'Erreur de lecture des rendez-vous', proposal: null };
    }

    // Filtrer par nom patient si disponible
    let matchingRdvs = rdvs || [];
    if (patientName && matchingRdvs.length > 1) {
      const nameLower = patientName.toLowerCase();
      const filtered = matchingRdvs.filter(r => {
        const rdvName = (r.patient_name || r.patient_nom || '').toLowerCase();
        return rdvName.includes(nameLower) || nameLower.includes(rdvName);
      });
      if (filtered.length > 0) {
        matchingRdvs = filtered;
      }
    }

    // Filtrer par heure si disponible
    if (time && matchingRdvs.length > 1) {
      const filtered = matchingRdvs.filter(r => {
        const rdvTime = (r.date_heure || '').substring(11, 16);
        return rdvTime === time;
      });
      if (filtered.length > 0) {
        matchingRdvs = filtered;
      }
    }

    if (matchingRdvs.length === 0) {
      return {
        success: true,
        found: false,
        proposal: {
          action: 'manual_check',
          message: `Aucun rendez-vous trouvé pour ${patientName || 'ce patient'}${date ? ` le ${date}` : ''}. Veuillez vérifier manuellement.`,
          cancellationData
        }
      };
    }

    // Construire la proposition (JAMAIS d'annulation automatique)
    const rdv = matchingRdvs[0];
    const proposal = {
      action: 'propose_cancel',
      rdv_id: rdv.id,
      rdv_date: rdv.date_heure,
      patient_name: rdv.patient_name || rdv.patient_nom,
      patient_phone: rdv.patient_phone || rdv.patient_tel,
      patient_email: rdv.patient_email,
      acte: rdv.acte || rdv.motif || rdv.type,
      reason: reason || 'Non précisée',
      multiple_matches: matchingRdvs.length > 1,
      all_matches_count: matchingRdvs.length,
      suggestions: [
        'Annuler ce rendez-vous et envoyer une confirmation au patient',
        'Proposer un report à une date ultérieure',
        'Contacter le patient pour confirmer l\'annulation'
      ],
      message: `Annulation demandée par ${patientName || 'le patient'} pour le ${rdv.date_heure ? new Date(rdv.date_heure).toLocaleDateString('fr-FR') : 'date inconnue'}. Motif : ${reason || 'non précisé'}. En attente de votre validation.`,
      requires_validation: true
    };

    // Valider la réponse via le brain
    try {
      validateResponse(proposal.message);
    } catch (_e) { /* pas bloquant */ }

    return { success: true, found: true, proposal };
  } catch (err) {
    console.error('[AGENT:AGENDA] cancelProposal error:', err.message);
    return { success: false, error: err.message, proposal: null };
  }
}

// ═══════════════════════════════════════
// FONCTION 3 : findReplacement
// Cherche des créneaux libres de remplacement
// ═══════════════════════════════════════

async function findReplacement(supabase, societeId, { date, duration = 30, speciality = null } = {}) {
  try {
    if (!date) {
      return { success: false, slots: [], error: 'Date requise pour chercher un remplacement' };
    }

    // Charger les RDV du jour pour trouver les trous
    const { data: dayRdvs, error } = await supabase
      .from('rdv')
      .select('date_heure, duree, patient_name, patient_nom, acte, motif')
      .eq('societe_id', societeId)
      .gte('date_heure', `${date}T07:00:00`)
      .lte('date_heure', `${date}T20:00:00`)
      .order('date_heure', { ascending: true });

    if (error) {
      console.error('[AGENT:AGENDA] findReplacement DB error:', error.message);
      return { success: false, slots: [], error: 'Erreur de lecture du planning' };
    }

    const rdvs = dayRdvs || [];

    // Horaires de travail (par défaut 8h-19h)
    const workStart = 8 * 60; // minutes
    const workEnd = 19 * 60;
    const lunchStart = 12 * 60;
    const lunchEnd = 14 * 60;

    // Calculer les créneaux occupés
    const occupied = rdvs.map(r => {
      const dt = new Date(r.date_heure);
      const startMin = dt.getHours() * 60 + dt.getMinutes();
      const dur = r.duree || 30;
      return { start: startMin, end: startMin + dur };
    }).sort((a, b) => a.start - b.start);

    // Trouver les trous
    const slots = [];
    let cursor = workStart;

    for (const occ of occupied) {
      // Sauter la pause déjeuner
      if (cursor >= lunchStart && cursor < lunchEnd) {
        cursor = lunchEnd;
      }

      if (occ.start > cursor && (occ.start - cursor) >= duration) {
        slots.push({
          start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
          end: `${String(Math.floor(occ.start / 60)).padStart(2, '0')}:${String(occ.start % 60).padStart(2, '0')}`,
          duration_available: occ.start - cursor,
          date
        });
      }
      cursor = Math.max(cursor, occ.end);
    }

    // Dernier créneau de la journée
    if (cursor >= lunchStart && cursor < lunchEnd) {
      cursor = lunchEnd;
    }
    if (cursor < workEnd && (workEnd - cursor) >= duration) {
      slots.push({
        start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
        end: `${String(Math.floor(workEnd / 60)).padStart(2, '0')}:${String(workEnd % 60).padStart(2, '0')}`,
        duration_available: workEnd - cursor,
        date
      });
    }

    // Vérifier aussi J+1 et J-1 si peu de créneaux
    let nearby = [];
    if (slots.length < 2) {
      const dateObj = new Date(date);
      for (const offset of [1, -1, 2]) {
        const d = new Date(dateObj);
        d.setDate(d.getDate() + offset);
        const dStr = d.toISOString().substring(0, 10);
        // Pas le dimanche
        if (d.getDay() === 0) continue;

        const { data: nearbyRdvs } = await supabase
          .from('rdv')
          .select('id')
          .eq('societe_id', societeId)
          .gte('date_heure', `${dStr}T07:00:00`)
          .lte('date_heure', `${dStr}T20:00:00`);

        const count = (nearbyRdvs || []).length;
        // Moins de 15 RDV = journée probablement pas pleine
        if (count < 15) {
          nearby.push({ date: dStr, rdv_count: count, day: d.toLocaleDateString('fr-FR', { weekday: 'long' }) });
        }
        if (nearby.length >= 2) break;
      }
    }

    return {
      success: true,
      slots,
      nearby_available: nearby,
      total_slots: slots.length,
      date,
      duration_requested: duration
    };
  } catch (err) {
    console.error('[AGENT:AGENDA] findReplacement error:', err.message);
    return { success: false, slots: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 4 : optimizeDay
// Analyse les trous et propose des optimisations
// ═══════════════════════════════════════

async function optimizeDay(supabase, societeId, date) {
  try {
    if (!date) {
      date = new Date().toISOString().substring(0, 10);
    }

    const { data: rdvs, error } = await supabase
      .from('rdv')
      .select('*')
      .eq('societe_id', societeId)
      .gte('date_heure', `${date}T00:00:00`)
      .lte('date_heure', `${date}T23:59:59`)
      .order('date_heure', { ascending: true });

    if (error) {
      return { success: false, suggestions: [], error: 'Erreur de lecture du planning' };
    }

    const allRdvs = rdvs || [];
    const suggestions = [];

    if (allRdvs.length === 0) {
      return {
        success: true,
        date,
        rdv_count: 0,
        suggestions: [{ type: 'empty_day', message: 'Aucun rendez-vous ce jour. Journée libre ou erreur de planning.' }],
        occupancy_percent: 0
      };
    }

    // Calculer les trous
    let totalGapMinutes = 0;
    for (let i = 0; i < allRdvs.length - 1; i++) {
      const endCurrent = new Date(allRdvs[i].date_heure);
      endCurrent.setMinutes(endCurrent.getMinutes() + (allRdvs[i].duree || 30));
      const startNext = new Date(allRdvs[i + 1].date_heure);
      const gap = (startNext - endCurrent) / 60000;

      if (gap > 30 && gap < 120) {
        // Trou exploitable (pas la pause déjeuner)
        const gapStart = endCurrent.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const gapEnd = startNext.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        suggestions.push({
          type: 'gap',
          start: gapStart,
          end: gapEnd,
          duration: gap,
          message: `Créneau libre de ${Math.round(gap)} min entre ${gapStart} et ${gapEnd}. Possibilité d'y placer un soin court ou un contrôle.`
        });
        totalGapMinutes += gap;
      } else if (gap >= 120) {
        // Gros trou
        const gapStart = endCurrent.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const gapEnd = startNext.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const startH = endCurrent.getHours();
        // Pas pendant la pause déjeuner standard
        if (!(startH >= 12 && startH < 14)) {
          suggestions.push({
            type: 'large_gap',
            start: gapStart,
            end: gapEnd,
            duration: gap,
            message: `Trou important de ${Math.round(gap)} min entre ${gapStart} et ${gapEnd}. Envisagez de contacter des patients en liste d'attente.`
          });
          totalGapMinutes += gap;
        }
      }
    }

    // Détection d'actes longs consécutifs
    let consecutiveLong = 0;
    for (const r of allRdvs) {
      if ((r.duree || 30) >= 60) {
        consecutiveLong++;
      } else {
        if (consecutiveLong >= 3) {
          suggestions.push({
            type: 'fatigue_risk',
            message: `${consecutiveLong} actes longs consécutifs détectés. Pensez à intercaler un soin court pour éviter la fatigue.`
          });
        }
        consecutiveLong = 0;
      }
    }

    // Calcul du taux d'occupation (8h-19h = 660 min, pause déjeuner 120 min = 540 min utiles)
    const totalBooked = allRdvs.reduce((sum, r) => sum + (r.duree || 30), 0);
    const usableMinutes = 540;
    const occupancy = Math.min(100, Math.round((totalBooked / usableMinutes) * 100));

    if (occupancy < 50) {
      suggestions.push({
        type: 'low_occupancy',
        message: `Taux d'occupation faible (${occupancy}%). Des créneaux sont disponibles pour de nouveaux patients.`
      });
    }

    return {
      success: true,
      date,
      rdv_count: allRdvs.length,
      total_booked_minutes: totalBooked,
      total_gap_minutes: Math.round(totalGapMinutes),
      occupancy_percent: occupancy,
      suggestions
    };
  } catch (err) {
    console.error('[AGENT:AGENDA] optimizeDay error:', err.message);
    return { success: false, suggestions: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 5 : getUpcoming
// Résumé des RDV à venir avec alertes
// ═══════════════════════════════════════

async function getUpcoming(supabase, societeId, { days = 7 } = {}) {
  try {
    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + days);

    const { data: rdvs, error } = await supabase
      .from('rdv')
      .select('*')
      .eq('societe_id', societeId)
      .gte('date_heure', now.toISOString())
      .lte('date_heure', end.toISOString())
      .order('date_heure', { ascending: true });

    if (error) {
      return { success: false, rdvs: [], alerts: [], error: 'Erreur de lecture du planning' };
    }

    const allRdvs = rdvs || [];
    const alerts = [];

    // Analyse des alertes
    const today = now.toISOString().substring(0, 10);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().substring(0, 10);

    let todayCount = 0;
    let tomorrowCount = 0;

    for (const r of allRdvs) {
      const rdvDate = (r.date_heure || '').substring(0, 10);

      if (rdvDate === today) todayCount++;
      if (rdvDate === tomorrowStr) tomorrowCount++;

      // Patient nouveau (pas de RDV précédent connu)
      if (r.is_new_patient || r.nouveau_patient) {
        alerts.push({
          type: 'new_patient',
          rdv_id: r.id,
          date: r.date_heure,
          patient: r.patient_name || r.patient_nom,
          message: `Nouveau patient : ${r.patient_name || r.patient_nom || 'inconnu'}`
        });
      }

      // Acte long (>= 60 min)
      if ((r.duree || 30) >= 60) {
        alerts.push({
          type: 'long_act',
          rdv_id: r.id,
          date: r.date_heure,
          patient: r.patient_name || r.patient_nom,
          duration: r.duree,
          message: `Acte long (${r.duree} min) pour ${r.patient_name || r.patient_nom || 'patient'}`
        });
      }

      // RDV sans confirmation
      if (r.status === 'pending' || r.statut === 'en_attente' || r.confirmed === false) {
        alerts.push({
          type: 'unconfirmed',
          rdv_id: r.id,
          date: r.date_heure,
          patient: r.patient_name || r.patient_nom,
          message: `RDV non confirmé : ${r.patient_name || r.patient_nom || 'patient'} le ${new Date(r.date_heure).toLocaleDateString('fr-FR')}`
        });
      }
    }

    // Résumé par jour
    const byDay = {};
    for (const r of allRdvs) {
      const d = (r.date_heure || '').substring(0, 10);
      if (!byDay[d]) byDay[d] = { count: 0, total_minutes: 0 };
      byDay[d].count++;
      byDay[d].total_minutes += (r.duree || 30);
    }

    return {
      success: true,
      period: { from: today, to: end.toISOString().substring(0, 10), days },
      total_rdvs: allRdvs.length,
      today_count: todayCount,
      tomorrow_count: tomorrowCount,
      alerts,
      alerts_count: alerts.length,
      by_day: byDay,
      rdvs: allRdvs.map(r => ({
        id: r.id,
        date: r.date_heure,
        patient: r.patient_name || r.patient_nom,
        acte: r.acte || r.motif || r.type,
        duration: r.duree || 30,
        status: r.status || r.statut || 'unknown'
      }))
    };
  } catch (err) {
    console.error('[AGENT:AGENDA] getUpcoming error:', err.message);
    return { success: false, rdvs: [], alerts: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 6 : findBestCandidateForSlot
// Recasage intelligent — trouve le meilleur
// patient à placer dans un créneau libéré
//
// Priorité :
// 1. Urgences (douleur, abcès...) si durée compatible
// 2. Waitlist par ancienneté + durée compatible
// 3. RDV annulés non reprogrammés
// 4. Aucun candidat → notifier "créneau libre"
//
// REGLE : ne propose QUE des candidats dont
// la durée d'acte RENTRE dans le créneau
// (1h de libre → pas un acte de 90min)
// ═══════════════════════════════════════

const URGENCY_ORDER = { critique: 0, urgent: 1, semi_urgent: 2, normal: 3, controle: 4 };

async function findBestCandidateForSlot(supabase, societeId, { slotDate, slotStart, slotDurationMin }) {
  try {
    if (!slotDate || !slotDurationMin || slotDurationMin < 10) {
      return { success: false, candidates: [], error: 'Paramètres manquants (date, durée)' };
    }

    const candidates = [];

    // ── Résoudre le cabinet_id depuis societe_id ──
    let cabinetId = null;
    try {
      const { data: cab } = await supabase
        .from('dentiste_pro_cabinets')
        .select('id')
        .eq('societe_id', societeId)
        .maybeSingle();
      cabinetId = cab?.id;
    } catch (_e) {}

    // ── 1. Urgences en waitlist (score >= 7, durée compatible) ──
    if (cabinetId) try {
      const { data: urgents } = await supabase
        .from('dentiste_pro_waitlist')
        .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email)')
        .eq('cabinet_id', cabinetId)
        .eq('status', 'waiting')
        .gte('urgency_score', 7)
        .order('urgency_score', { ascending: false })
        .order('created_at', { ascending: true });

      for (const w of (urgents || [])) {
        const patient = w.patient || {};
        const name = `${patient.prenom || ''} ${patient.nom || ''}`.trim() || 'Patient';
        candidates.push({
          source: 'waitlist_urgence',
          waitlist_id: w.id,
          patient_name: name,
          patient_phone: patient.telephone,
          patient_email: patient.email,
          acte: w.appointment_type_id || null,
          duree_min: slotDurationMin, // waitlist n'a pas la durée — on la prend du slot
          urgency: w.urgency_score >= 9 ? 'critique' : w.urgency_score >= 7 ? 'urgent' : 'normal',
          urgency_rank: Math.max(0, 4 - Math.floor(w.urgency_score / 2.5)),
          waiting_since: w.wait_since || w.created_at,
          days_waiting: Math.round((Date.now() - new Date(w.wait_since || w.created_at).getTime()) / 86400000),
          fits_in_slot: true,
          notes: w.urgency_note,
        });
      }
    } catch (_e) {}

    // ── 2. Patients normaux en waitlist (score < 7) ──
    if (cabinetId) try {
      const { data: normals } = await supabase
        .from('dentiste_pro_waitlist')
        .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email)')
        .eq('cabinet_id', cabinetId)
        .eq('status', 'waiting')
        .lt('urgency_score', 7)
        .order('created_at', { ascending: true })
        .limit(10);

      for (const w of (normals || [])) {
        const patient = w.patient || {};
        const name = `${patient.prenom || ''} ${patient.nom || ''}`.trim() || 'Patient';
        candidates.push({
          source: 'waitlist_normal',
          waitlist_id: w.id,
          patient_name: name,
          patient_phone: patient.telephone,
          patient_email: patient.email,
          acte: w.appointment_type_id || null,
          duree_min: slotDurationMin,
          urgency: 'normal',
          urgency_rank: URGENCY_ORDER.normal,
          waiting_since: w.wait_since || w.created_at,
          days_waiting: Math.round((Date.now() - new Date(w.wait_since || w.created_at).getTime()) / 86400000),
          fits_in_slot: true,
          notes: w.urgency_note,
        });
      }
    } catch (_e) {}

    // ── 3. RDV annulés non reprogrammés (3 derniers mois) ──
    try {
      const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: cancelled } = await supabase
        .from('rdv')
        .select('id, patient_name, patient_nom, patient_phone, patient_tel, patient_email, acte, motif, duree, date_heure')
        .eq('societe_id', societeId)
        .gte('date_heure', threeMonthsAgo)
        .in('status', ['cancelled', 'annule', 'annulé'])
        .order('date_heure', { ascending: false })
        .limit(20);

      // Exclure ceux qui ont déjà un futur RDV
      const { data: futureRdvs } = await supabase
        .from('rdv')
        .select('patient_name, patient_nom')
        .eq('societe_id', societeId)
        .gt('date_heure', new Date().toISOString())
        .not('status', 'in', '("cancelled","annule","annulé")');

      const futureNames = new Set(
        (futureRdvs || []).map(r => (r.patient_name || r.patient_nom || '').toLowerCase())
      );

      for (const r of (cancelled || [])) {
        const name = r.patient_name || r.patient_nom || '';
        if (futureNames.has(name.toLowerCase())) continue;

        const duree = r.duree || 30;
        if (duree > slotDurationMin) continue; // Ne rentre pas dans le créneau

        candidates.push({
          source: 'cancelled_not_rescheduled',
          rdv_id: r.id,
          patient_name: name,
          patient_phone: r.patient_phone || r.patient_tel,
          patient_email: r.patient_email,
          acte: r.acte || r.motif,
          duree_min: duree,
          urgency: 'normal',
          urgency_rank: URGENCY_ORDER.normal,
          original_date: r.date_heure,
          fits_in_slot: true,
        });
      }
    } catch (_e) {}

    // ── Tri final : urgence → ancienneté → meilleur remplissage du créneau ──
    candidates.sort((a, b) => {
      // 1. Urgence (critique < urgent < semi_urgent < normal < contrôle)
      if (a.urgency_rank !== b.urgency_rank) return a.urgency_rank - b.urgency_rank;
      // 2. Meilleur remplissage du créneau (le plus proche de la durée dispo)
      const fillA = slotDurationMin - (a.duree_min || 30);
      const fillB = slotDurationMin - (b.duree_min || 30);
      if (fillA !== fillB) return fillA - fillB; // Moins de gaspillage en premier
      // 3. Le plus ancien en waitlist d'abord
      return (b.days_waiting || 0) - (a.days_waiting || 0);
    });

    // Résumé
    const best = candidates.length > 0 ? candidates[0] : null;
    let message = '';
    if (!best) {
      message = `Aucun candidat trouvé pour le créneau de ${slotDurationMin} min le ${slotDate} à ${slotStart || '?'}.`;
    } else if (best.source === 'waitlist_urgence') {
      message = `Urgence : ${best.patient_name} (${best.acte || 'acte non précisé'}, ${best.duree_min} min) en attente depuis ${best.days_waiting} jour(s). Priorité ${best.urgency}.`;
    } else if (best.source === 'waitlist_normal') {
      message = `${best.patient_name} en liste d'attente depuis ${best.days_waiting} jour(s) (${best.acte || 'acte non précisé'}, ${best.duree_min} min).`;
    } else {
      message = `${best.patient_name} avait un RDV annulé (${best.acte || 'acte non précisé'}, ${best.duree_min} min). Non reprogrammé.`;
    }

    return {
      success: true,
      slot: { date: slotDate, start: slotStart, duration_min: slotDurationMin },
      candidates,
      candidates_count: candidates.length,
      best_candidate: best,
      message,
      requires_validation: true, // TOUJOURS — le dentiste valide
    };
  } catch (err) {
    console.error('[AGENT:AGENDA] findBestCandidateForSlot error:', err.message);
    return { success: false, candidates: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════

module.exports = {
  detectCancellation,
  cancelProposal,
  findReplacement,
  optimizeDay,
  getUpcoming,
  findBestCandidateForSlot,
};
