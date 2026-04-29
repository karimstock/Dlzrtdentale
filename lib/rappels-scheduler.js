/**
 * JADOMI — Rappels Scheduler
 * Verifie toutes les 15 minutes les rappels a envoyer (email + SMS + push)
 * Cascade intelligente : Email -> Push (6h) -> SMS (urgent uniquement)
 * Compatible toutes professions
 */
const { createClient } = require('@supabase/supabase-js');
const { sendSMS } = require('./sms-sender');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let _admin = null;
function admin() {
  if (!_admin) {
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant pour le scheduler');
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Templates par defaut
const DEFAULT_TEMPLATES = {
  rdv_j2: {
    sujet: 'Rappel : votre rendez-vous du {{date}}',
    corps: 'Rappel : votre rendez-vous avec {{praticien}} est prévu le {{date}} à {{heure}}. Cabinet {{cabinet}}.'
  },
  rdv_j1: {
    sujet: 'Demain : votre rendez-vous à {{heure}}',
    corps: 'C\'est demain ! Rendez-vous à {{heure}} avec {{praticien}}. {{adresse}}'
  },
  rdv_h2: {
    sujet: 'Dans 2 heures : votre rendez-vous',
    corps: 'Dans 2 heures : votre rendez-vous avec {{praticien}} à {{heure}}.'
  },
  post_soin_j1: {
    sujet: 'Comment vous sentez-vous ?',
    corps: 'Bonjour {{prenom}}, comment vous sentez-vous après votre soin d\'hier ? N\'hésitez pas à nous contacter.'
  },
  recall_6mois: {
    sujet: 'Il est temps de prendre rendez-vous',
    corps: 'Bonjour {{prenom}}, votre dernier passage chez {{praticien}} date de plus de 6 mois. Il est temps de prendre rendez-vous.'
  },
  recall_1an: {
    sujet: 'Votre contrôle annuel est dû',
    corps: 'Bonjour {{prenom}}, votre contrôle annuel est dû. Prenez rendez-vous avec {{praticien}}.'
  },
  anniversaire: {
    sujet: 'Joyeux anniversaire !',
    corps: 'Toute l\'équipe de {{cabinet}} vous souhaite un joyeux anniversaire, {{prenom}} !'
  },
  avis_google: {
    sujet: 'Votre avis nous intéresse',
    corps: 'Bonjour {{prenom}}, votre avis nous aide à progresser. Laissez-nous une note sur Google : {{lien_google}}'
  },
  ordonnance_expiration: {
    sujet: 'Votre ordonnance expire bientôt',
    corps: 'Bonjour {{prenom}}, votre ordonnance expire dans {{jours}} jours. Consultez votre médecin pour un renouvellement.'
  }
};

/**
 * Remplace les {{variables}} dans un template
 */
function applyTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

/**
 * Verifie si un rappel a deja ete envoye (dedup)
 */
async function alreadySent(configId, rdvId) {
  if (!rdvId) return false;
  const { data } = await admin()
    .from('rappels_envois')
    .select('id')
    .eq('rappel_config_id', configId)
    .eq('rdv_id', rdvId)
    .in('statut', ['envoye', 'programme'])
    .limit(1);
  return data && data.length > 0;
}

/**
 * Decremente les credits SMS et verifie le solde
 * @returns {boolean} true si credits suffisants
 */
async function debitSmsCredit(societeId) {
  const { data } = await admin()
    .from('sms_wallet')
    .select('credits_sms')
    .eq('societe_id', societeId)
    .single();

  if (!data || data.credits_sms < 1) return false;

  const { data: wallet } = await admin()
    .from('sms_wallet')
    .select('credits_sms, total_envoye')
    .eq('societe_id', societeId)
    .single();

  if (!wallet || wallet.credits_sms < 1) return false;

  await admin()
    .from('sms_wallet')
    .update({
      credits_sms: wallet.credits_sms - 1,
      total_envoye: (wallet.total_envoye || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('societe_id', societeId);

  return true;
}

const PUBLIC_HOST = process.env.PUBLIC_HOST || 'https://jadomi.fr';

/**
 * Envoie un email de rappel via le mailer existant
 * @param {string} trackingId - UUID pour le pixel de tracking et le lien de confirmation
 */
async function sendRappelEmail(to, subject, body, fromName, trackingId) {
  try {
    const { sendMail } = require('../api/multiSocietes/mailer');
    const pixelUrl = trackingId ? `${PUBLIC_HOST}/api/rappels/track/${trackingId}/pixel.png` : '';
    const confirmUrl = trackingId ? `${PUBLIC_HOST}/api/rappels/track/${trackingId}/confirm` : '';
    const pixelTag = trackingId ? `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">` : '';
    const confirmBlock = trackingId ? `
        <div style="text-align:center;margin-top:24px;">
          <a href="${confirmUrl}" style="display:inline-block;background:#6C3AE0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Confirmer ma présence</a>
        </div>` : '';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h2 style="color:#6C3AE0;margin:0;">JADOMI</h2>
        </div>
        <div style="background:#f9f9f9;border-radius:12px;padding:24px;line-height:1.6;color:#333;">
          ${body.replace(/\n/g, '<br>')}
        </div>
        ${confirmBlock}
        <div style="text-align:center;margin-top:20px;font-size:12px;color:#999;">
          Ce message a été envoyé automatiquement par JADOMI.<br>
          Pour ne plus recevoir ces rappels, contactez votre praticien.
        </div>
        ${pixelTag}
      </div>
    `;
    const result = await sendMail({
      to,
      subject,
      html,
      from: fromName ? `"${fromName}" <noreply@jadomi.fr>` : undefined
    });
    return { success: result.ok !== false, message_id: result.messageId || null };
  } catch (e) {
    console.error('[Rappels] Erreur email:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Enregistre un envoi dans rappels_envois
 * @returns {string|null} tracking_id de l'envoi cree
 */
async function logEnvoi({ configId, societeId, email, telephone, nom, type, statut, rdvId, contenu, trackingId }) {
  try {
    const record = {
      rappel_config_id: configId,
      societe_id: societeId,
      patient_email: email || null,
      patient_telephone: telephone || null,
      patient_nom: nom || null,
      type,
      statut,
      rdv_id: rdvId || null,
      contenu: contenu ? contenu.substring(0, 500) : null,
      envoye_at: statut === 'envoye' ? new Date().toISOString() : null,
      escalated: false,
      opened: false
    };
    if (trackingId) record.tracking_id = trackingId;

    const { data } = await admin().from('rappels_envois').insert(record).select('tracking_id').single();
    return data ? data.tracking_id : null;
  } catch (e) {
    console.error('[Rappels] Erreur log envoi:', e.message);
    return null;
  }
}

/**
 * Recupere les infos de la societe (nom, adresse) pour les templates
 */
async function getSocieteInfo(societeId) {
  try {
    const { data } = await admin()
      .from('societes')
      .select('id, nom, adresse, telephone, email, google_place_id')
      .eq('id', societeId)
      .single();
    return data || {};
  } catch (e) {
    return {};
  }
}

/**
 * Traite les rappels de type RDV (J-2, J-1, H-2)
 */
async function processRdvRappels(config, societeInfo) {
  const now = new Date();
  let targetStart, targetEnd;

  if (config.declencheur === 'rdv_j2') {
    // RDV dans 2 jours (fenetre de 15 min)
    targetStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 - 7.5 * 60 * 1000);
    targetEnd = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 7.5 * 60 * 1000);
  } else if (config.declencheur === 'rdv_j1') {
    // RDV demain (fenetre de 15 min)
    targetStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 - 7.5 * 60 * 1000);
    targetEnd = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 7.5 * 60 * 1000);
  } else if (config.declencheur === 'rdv_h2') {
    // RDV dans 2 heures (fenetre de 15 min)
    targetStart = new Date(now.getTime() + 2 * 60 * 60 * 1000 - 7.5 * 60 * 1000);
    targetEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 7.5 * 60 * 1000);
  } else {
    return;
  }

  // Trouver les sites de cette societe
  const { data: sites } = await admin()
    .from('vitrines_sites')
    .select('id')
    .eq('societe_id', config.societe_id);

  if (!sites || sites.length === 0) return;

  const siteIds = sites.map(s => s.id);

  // Trouver les RDV dans la fenetre
  const { data: rdvs } = await admin()
    .from('appointments')
    .select('id, client_name, client_email, client_phone, start_time, site_id')
    .in('site_id', siteIds)
    .eq('status', 'confirmed')
    .gte('start_time', targetStart.toISOString())
    .lte('start_time', targetEnd.toISOString());

  if (!rdvs || rdvs.length === 0) return;

  for (const rdv of rdvs) {
    // Dedup
    if (await alreadySent(config.id, rdv.id)) continue;

    const rdvDate = new Date(rdv.start_time);
    const nameParts = (rdv.client_name || '').split(' ');
    const vars = {
      prenom: nameParts[0] || '',
      nom: nameParts.slice(1).join(' ') || '',
      date: rdvDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      heure: rdvDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      praticien: societeInfo.nom || 'votre praticien',
      cabinet: societeInfo.nom || '',
      adresse: societeInfo.adresse || ''
    };

    const tpl = DEFAULT_TEMPLATES[config.declencheur] || {};
    const sujet = applyTemplate(config.template_sujet || tpl.sujet || 'Rappel', vars);
    const corps = applyTemplate(config.template_corps || tpl.corps || '', vars);

    // Email (avec tracking pixel pour la cascade d'escalade)
    if ((config.type === 'email' || config.type === 'both') && rdv.client_email) {
      // Creer d'abord le log pour obtenir le tracking_id
      const trackingId = await logEnvoi({
        configId: config.id, societeId: config.societe_id,
        email: rdv.client_email, nom: rdv.client_name,
        type: 'email', statut: 'programme',
        rdvId: rdv.id, contenu: corps
      });
      const result = await sendRappelEmail(rdv.client_email, sujet, corps, societeInfo.nom, trackingId);
      // Mettre a jour le statut apres envoi
      if (trackingId) {
        try {
          await admin().from('rappels_envois')
            .update({ statut: result.success ? 'envoye' : 'echoue', envoye_at: result.success ? new Date().toISOString() : null })
            .eq('tracking_id', trackingId);
        } catch (_) {}
      }
    }

    // SMS
    if ((config.type === 'sms' || config.type === 'both') && rdv.client_phone) {
      const hasCredits = await debitSmsCredit(config.societe_id);
      if (hasCredits) {
        const result = await sendSMS(rdv.client_phone, corps);
        await logEnvoi({
          configId: config.id, societeId: config.societe_id,
          telephone: rdv.client_phone, nom: rdv.client_name,
          type: 'sms', statut: result.success ? 'envoye' : 'echoue',
          rdvId: rdv.id, contenu: corps
        });
      } else {
        await logEnvoi({
          configId: config.id, societeId: config.societe_id,
          telephone: rdv.client_phone, nom: rdv.client_name,
          type: 'sms', statut: 'echoue',
          rdvId: rdv.id, contenu: 'Credits SMS insuffisants'
        });
      }
    }
  }
}

/**
 * Traite les rappels post-soin (J+1 apres un RDV termine)
 */
async function processPostSoinRappels(config, societeInfo) {
  const now = new Date();
  // RDV termines hier (fenetre de 15 min autour de 24h apres)
  const targetStart = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 7.5 * 60 * 1000);
  const targetEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000 + 7.5 * 60 * 1000);

  const { data: sites } = await admin()
    .from('vitrines_sites')
    .select('id')
    .eq('societe_id', config.societe_id);

  if (!sites || sites.length === 0) return;
  const siteIds = sites.map(s => s.id);

  const { data: rdvs } = await admin()
    .from('appointments')
    .select('id, client_name, client_email, client_phone, start_time')
    .in('site_id', siteIds)
    .eq('status', 'completed')
    .gte('start_time', targetStart.toISOString())
    .lte('start_time', targetEnd.toISOString());

  if (!rdvs || rdvs.length === 0) return;

  for (const rdv of rdvs) {
    if (await alreadySent(config.id, rdv.id)) continue;

    const nameParts = (rdv.client_name || '').split(' ');
    const vars = {
      prenom: nameParts[0] || '',
      nom: nameParts.slice(1).join(' ') || '',
      praticien: societeInfo.nom || 'votre praticien',
      cabinet: societeInfo.nom || '',
      adresse: societeInfo.adresse || ''
    };

    const tpl = DEFAULT_TEMPLATES.post_soin_j1;
    const sujet = applyTemplate(config.template_sujet || tpl.sujet, vars);
    const corps = applyTemplate(config.template_corps || tpl.corps, vars);

    if ((config.type === 'email' || config.type === 'both') && rdv.client_email) {
      const trackingId = await logEnvoi({
        configId: config.id, societeId: config.societe_id,
        email: rdv.client_email, nom: rdv.client_name,
        type: 'email', statut: 'programme',
        rdvId: rdv.id, contenu: corps
      });
      const result = await sendRappelEmail(rdv.client_email, sujet, corps, societeInfo.nom, trackingId);
      if (trackingId) {
        try {
          await admin().from('rappels_envois')
            .update({ statut: result.success ? 'envoye' : 'echoue', envoye_at: result.success ? new Date().toISOString() : null })
            .eq('tracking_id', trackingId);
        } catch (_) {}
      }
    }

    if ((config.type === 'sms' || config.type === 'both') && rdv.client_phone) {
      const hasCredits = await debitSmsCredit(config.societe_id);
      if (hasCredits) {
        const result = await sendSMS(rdv.client_phone, corps);
        await logEnvoi({
          configId: config.id, societeId: config.societe_id,
          telephone: rdv.client_phone, nom: rdv.client_name,
          type: 'sms', statut: result.success ? 'envoye' : 'echoue',
          rdvId: rdv.id, contenu: corps
        });
      }
    }
  }
}

/**
 * Cascade d'escalade : verifie les emails non ouverts apres 6h
 * Flow : Email -> Push (si abonnement) -> SMS (si urgent J-1 / H-2)
 * Tourne toutes les heures
 */
async function checkEscalations() {
  try {
    if (!SERVICE_KEY) return;

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Trouver les envois email non ouverts, non escalades, envoyes il y a plus de 6h
    const { data: envois, error } = await admin()
      .from('rappels_envois')
      .select('*')
      .eq('statut', 'envoye')
      .eq('type', 'email')
      .eq('escalated', false)
      .eq('opened', false)
      .lt('envoye_at', sixHoursAgo)
      .limit(50);

    if (error) {
      console.error('[Rappels Escalade] Erreur requete:', error.message);
      return;
    }

    if (!envois || envois.length === 0) return;

    console.log(`[Rappels Escalade] ${envois.length} email(s) non ouvert(s) a escalader`);

    let pushSent = 0;
    let smsSent = 0;

    for (const envoi of envois) {
      try {
        // Marquer comme escalade immediatement (eviter double traitement)
        await admin().from('rappels_envois')
          .update({ escalated: true })
          .eq('id', envoi.id);

        // Etape 1 : Tenter push notification
        if (envoi.patient_email || envoi.patient_telephone) {
          try {
            const { sendPushToPatient } = require('../api/push');
            const pushResult = await sendPushToPatient({
              email: envoi.patient_email,
              telephone: envoi.patient_telephone,
              title: 'Rappel JADOMI',
              body: envoi.contenu ? envoi.contenu.substring(0, 200) : 'Vous avez un rappel en attente.',
              url: '/',
              tag: 'jadomi-rappel-escalade'
            });

            if (pushResult.success) {
              pushSent++;
              await logEnvoi({
                configId: envoi.rappel_config_id,
                societeId: envoi.societe_id,
                email: envoi.patient_email,
                telephone: envoi.patient_telephone,
                nom: envoi.patient_nom,
                type: 'push',
                statut: 'envoye',
                rdvId: envoi.rdv_id,
                contenu: envoi.contenu
              });
              continue; // Push reussi, pas besoin de SMS
            }
          } catch (pushErr) {
            console.warn('[Rappels Escalade] Push echoue:', pushErr.message);
          }
        }

        // Etape 2 : SMS seulement si urgent (J-1 ou H-2) ET le push a echoue
        if (envoi.patient_telephone && envoi.rappel_config_id) {
          try {
            // Verifier si le declencheur est urgent
            const { data: config } = await admin()
              .from('rappels_config')
              .select('declencheur, societe_id')
              .eq('id', envoi.rappel_config_id)
              .single();

            const isUrgent = config && (config.declencheur === 'rdv_j1' || config.declencheur === 'rdv_h2');

            if (isUrgent) {
              const hasCredits = await debitSmsCredit(config.societe_id);
              if (hasCredits) {
                const smsText = envoi.contenu || 'Rappel JADOMI : vous avez un rendez-vous bientot.';
                const smsResult = await sendSMS(envoi.patient_telephone, smsText);
                if (smsResult.success) smsSent++;
                await logEnvoi({
                  configId: envoi.rappel_config_id,
                  societeId: envoi.societe_id,
                  telephone: envoi.patient_telephone,
                  nom: envoi.patient_nom,
                  type: 'sms',
                  statut: smsResult.success ? 'envoye' : 'echoue',
                  rdvId: envoi.rdv_id,
                  contenu: smsText
                });
              } else {
                console.warn('[Rappels Escalade] Credits SMS insuffisants pour', config.societe_id);
              }
            }
          } catch (smsErr) {
            console.error('[Rappels Escalade] SMS echoue:', smsErr.message);
          }
        }
      } catch (e) {
        console.error('[Rappels Escalade] Erreur traitement envoi', envoi.id, ':', e.message);
      }
    }

    if (pushSent > 0 || smsSent > 0) {
      console.log(`[Rappels Escalade] Bilan : ${pushSent} push, ${smsSent} SMS envoyes`);
    }
  } catch (e) {
    console.error('[Rappels Escalade] Erreur globale:', e.message);
  }
}

/**
 * Point d'entree principal : verifie et envoie tous les rappels
 */
async function checkAndSendRappels() {
  try {
    if (!SERVICE_KEY) {
      console.log('[Rappels] SERVICE_KEY manquant, scheduler inactif');
      return;
    }

    // Recuperer toutes les configs actives
    const { data: configs, error } = await admin()
      .from('rappels_config')
      .select('*')
      .eq('actif', true);

    if (error) {
      console.error('[Rappels] Erreur chargement configs:', error.message);
      return;
    }

    if (!configs || configs.length === 0) return;

    console.log(`[Rappels] Vérification de ${configs.length} configuration(s) active(s)...`);

    // Cache des infos societe
    const societeCache = {};

    for (const config of configs) {
      try {
        if (!societeCache[config.societe_id]) {
          societeCache[config.societe_id] = await getSocieteInfo(config.societe_id);
        }
        const societeInfo = societeCache[config.societe_id];

        switch (config.declencheur) {
          case 'rdv_j2':
          case 'rdv_j1':
          case 'rdv_h2':
            await processRdvRappels(config, societeInfo);
            break;
          case 'post_soin_j1':
            await processPostSoinRappels(config, societeInfo);
            break;
          // recall_6mois, recall_1an, anniversaire, avis_google, ordonnance_expiration
          // seront traites dans une prochaine iteration (necessite table patients enrichie)
          default:
            break;
        }
      } catch (e) {
        console.error(`[Rappels] Erreur config ${config.id} (${config.declencheur}):`, e.message);
      }
    }
  } catch (e) {
    console.error('[Rappels] Erreur scheduler:', e.message);
  }
}

module.exports = { checkAndSendRappels, checkEscalations, DEFAULT_TEMPLATES, applyTemplate };
