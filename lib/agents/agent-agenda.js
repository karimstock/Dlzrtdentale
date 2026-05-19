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
// EXPORTS
// ═══════════════════════════════════════

module.exports = {
  detectCancellation,
  cancelProposal,
  findReplacement,
  optimizeDay,
  getUpcoming
};
