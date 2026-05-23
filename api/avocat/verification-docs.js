// =============================================
// JADOMI AVOCAT — Vérification Documents Juridiques
// Système anti-erreurs : contrôles structurels, cohérence, IA
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// === PIECES ATTENDUES PAR DOMAINE ===
const PIECES_PAR_DOMAINE = {
  licenciement: [
    { type: 'contrat_travail', label: 'Contrat de travail', priorite: 'haute' },
    { type: 'bulletins_salaire', label: 'Bulletins de salaire', priorite: 'haute' },
    { type: 'lettre_licenciement', label: 'Lettre de licenciement', priorite: 'haute' },
    { type: 'convocation_entretien', label: 'Convocation entretien préalable (LRAR)', priorite: 'haute' },
    { type: 'notification_licenciement', label: 'Notification de licenciement', priorite: 'haute' },
    { type: 'compte_rendu_entretien', label: 'Compte-rendu entretien préalable', priorite: 'moyenne' },
    { type: 'attestation_pole_emploi', label: 'Attestation Pôle emploi', priorite: 'moyenne' },
    { type: 'certificat_travail', label: 'Certificat de travail', priorite: 'moyenne' },
    { type: 'solde_tout_compte', label: 'Solde de tout compte', priorite: 'moyenne' }
  ],
  harcelement: [
    { type: 'mails_sms', label: 'Mails / SMS probants', priorite: 'haute' },
    { type: 'attestations_temoins', label: 'Attestations de témoins', priorite: 'haute' },
    { type: 'certificat_medical', label: 'Certificat médical', priorite: 'haute' },
    { type: 'courriers_signalement', label: 'Courriers de signalement', priorite: 'haute' },
    { type: 'contrat_travail', label: 'Contrat de travail', priorite: 'moyenne' },
    { type: 'arrets_travail', label: 'Arrêts de travail', priorite: 'moyenne' },
    { type: 'main_courante', label: 'Main courante / dépôt de plainte', priorite: 'moyenne' }
  ],
  heures_supplementaires: [
    { type: 'bulletins_salaire', label: 'Bulletins de salaire', priorite: 'haute' },
    { type: 'planning_horaires', label: 'Planning / horaires', priorite: 'haute' },
    { type: 'decompte_heures', label: 'Décompte des heures', priorite: 'haute' },
    { type: 'attestations_temoins', label: 'Attestations de collègues', priorite: 'moyenne' },
    { type: 'contrat_travail', label: 'Contrat de travail', priorite: 'moyenne' },
    { type: 'mails_professionnels', label: 'Mails professionnels (horodatés)', priorite: 'moyenne' }
  ],
  inaptitude: [
    { type: 'avis_medecin_travail', label: 'Avis du médecin du travail', priorite: 'haute' },
    { type: 'recherche_reclassement', label: 'Recherche de reclassement', priorite: 'haute' },
    { type: 'notifications_inaptitude', label: 'Notifications d\'inaptitude', priorite: 'haute' },
    { type: 'contrat_travail', label: 'Contrat de travail', priorite: 'moyenne' },
    { type: 'bulletins_salaire', label: 'Bulletins de salaire', priorite: 'moyenne' },
    { type: 'courriers_employeur', label: 'Courriers de l\'employeur', priorite: 'moyenne' },
    { type: 'certificats_medicaux', label: 'Certificats médicaux complémentaires', priorite: 'moyenne' }
  ]
};

// === HELPERS ===

function normaliserDomaine(domaine) {
  if (!domaine) return null;
  const d = domaine.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z_]/g, '_');
  if (d.includes('licenciement')) return 'licenciement';
  if (d.includes('harcelement')) return 'harcelement';
  if (d.includes('heure') || d.includes('supplementaire')) return 'heures_supplementaires';
  if (d.includes('inaptitude')) return 'inaptitude';
  return null;
}

function controler(id, nom, ok, detail) {
  return {
    id,
    nom,
    statut: ok === true ? 'ok' : (ok === false ? 'erreur' : 'attention'),
    detail: detail || ''
  };
}

function contientTexte(html, texte) {
  if (!html || !texte) return false;
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return norm(html).includes(norm(texte));
}

// ================================================
// POST /verifier/:documentId — Vérification document
// ================================================
router.post('/verifier/:documentId', requireAvocat, async (req, res) => {
  try {
    const { documentId } = req.params;
    const useIA = req.query.ia === 'true';

    // Charger le document généré
    const { data: doc, error: docErr } = await admin()
      .from('avocat_documents_generes')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docErr || !doc) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    const html = doc.contenu_html || '';

    // Charger le dossier
    const { data: dossier } = await admin()
      .from('avocat_dossiers')
      .select('*')
      .eq('id', doc.dossier_id)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier associé non trouvé' });
    }

    // Charger le client
    const { data: client } = await admin()
      .from('avocat_clients')
      .select('*')
      .eq('id', dossier.client_id)
      .single();

    // Charger pièces, contradictions, pièces manquantes
    const [piecesRes, contradictionsRes, manquantesRes] = await Promise.all([
      admin().from('avocat_pieces').select('*').eq('dossier_id', dossier.id),
      admin().from('avocat_contradictions').select('*').eq('dossier_id', dossier.id),
      admin().from('avocat_pieces_manquantes').select('*').eq('dossier_id', dossier.id)
    ]);

    const pieces = piecesRes.data || [];
    const contradictions = contradictionsRes.data || [];
    const manquantes = manquantesRes.data || [];

    // === CONTROLES STRUCTURELS ===
    const controles = [];

    // 1. RG présent
    const rgPresent = /\bRG\b/i.test(html);
    controles.push(controler(1, 'Numéro RG présent', rgPresent,
      rgPresent ? 'Numéro RG détecté dans le document' : 'Aucun numéro RG trouvé dans le document'));

    // 2. Juridiction mentionnée
    const juridictionPresente = /conseil\s+de\s+prud'?hommes/i.test(html) || /\bCPH\b/.test(html);
    controles.push(controler(2, 'Juridiction mentionnée', juridictionPresente,
      juridictionPresente ? 'Juridiction (Conseil de prud\'hommes / CPH) détectée' : 'Aucune mention de la juridiction'));

    // 3. Nom client présent
    const clientNomComplet = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : '';
    const clientPresent = clientNomComplet ? (contientTexte(html, client.nom) || contientTexte(html, clientNomComplet)) : false;
    controles.push(controler(3, 'Nom du client présent', clientPresent,
      clientPresent ? `Client "${clientNomComplet}" détecté` : 'Le nom du client n\'apparaît pas dans le document'));

    // 4. Nom adversaire/employeur
    const adversairePresent = /employeur|soci[eé]t[eé]|entreprise|sarl|sas|sa\b|sasu/i.test(html);
    controles.push(controler(4, 'Adversaire / employeur mentionné', adversairePresent ? true : null,
      adversairePresent ? 'Mention d\'un employeur ou d\'une société détectée' : 'Vérifiez la mention de l\'adversaire ou de l\'employeur'));

    // 5. Date du document
    const datePresente = /\d{1,2}\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+\d{4}/i.test(html) ||
                         /\d{2}\/\d{2}\/\d{4}/.test(html);
    controles.push(controler(5, 'Date du document présente', datePresente,
      datePresente ? 'Date détectée dans le document' : 'Aucune date de rédaction détectée'));

    // 6. Signature (avocat + barreau)
    const signaturePresente = /avocat/i.test(html) && /barreau/i.test(html);
    controles.push(controler(6, 'Signature avocat et barreau', signaturePresente,
      signaturePresente ? 'Mention de l\'avocat et du barreau détectée' : 'Vérifiez la présence de la signature avec mention du barreau'));

    // 7. Mentions obligatoires (SOUS TOUTES RESERVES)
    const estConclusions = /conclusions/i.test(html);
    const sousReserves = /sous\s+toutes?\s+r[eé]serves?/i.test(html);
    if (estConclusions) {
      controles.push(controler(7, 'Mention "SOUS TOUTES RESERVES"', sousReserves,
        sousReserves ? 'Mention obligatoire présente' : 'La mention "SOUS TOUTES RESERVES" est absente des conclusions'));
    } else {
      controles.push(controler(7, 'Mention "SOUS TOUTES RESERVES"', null,
        'Document non identifié comme conclusions — vérification non applicable'));
    }

    // 8. Bordereau de pièces
    const bordereauPresent = /bordereau/i.test(html) && /pi[eè]ces?/i.test(html);
    if (estConclusions) {
      controles.push(controler(8, 'Bordereau de pièces référencé', bordereauPresent,
        bordereauPresent ? 'Bordereau de pièces détecté' : 'Aucun bordereau de pièces dans les conclusions'));
    } else {
      controles.push(controler(8, 'Bordereau de pièces référencé', null,
        'Vérification du bordereau applicable principalement aux conclusions'));
    }

    // === CONTROLES DE COHERENCE ===

    // 9. Dates cohérentes
    const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    let dateCoherente = null;
    let dateDetail = 'Aucune date exploitable pour la vérification';
    if (dateMatch) {
      const docDate = new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
      const now = new Date();
      const dossierCreated = dossier.created_at ? new Date(dossier.created_at) : null;
      if (docDate > now) {
        dateCoherente = false;
        dateDetail = 'La date du document est dans le futur';
      } else if (dossierCreated && docDate < dossierCreated) {
        dateCoherente = false;
        dateDetail = 'La date du document est antérieure à l\'ouverture du dossier';
      } else {
        dateCoherente = true;
        dateDetail = 'Les dates sont cohérentes';
      }
    }
    controles.push(controler(9, 'Cohérence des dates', dateCoherente, dateDetail));

    // 10. Pièces référencées existent
    const piecesRefs = html.match(/pi[eè]ce\s*n?\s*[°o]?\s*(\d+)/gi) || [];
    const numerosRefs = piecesRefs.map(p => {
      const m = p.match(/(\d+)/);
      return m ? parseInt(m[1]) : null;
    }).filter(Boolean);
    const piecesExistantes = pieces.length > 0;
    let piecesRefDetail = 'Aucune référence de pièce détectée dans le document';
    let piecesRefOk = null;
    if (numerosRefs.length > 0 && piecesExistantes) {
      const maxPiece = pieces.length;
      const horsLimite = numerosRefs.filter(n => n > maxPiece);
      if (horsLimite.length > 0) {
        piecesRefOk = false;
        piecesRefDetail = `Pièce(s) référencée(s) inexistante(s) : n°${horsLimite.join(', n°')} (le dossier contient ${maxPiece} pièce(s))`;
      } else {
        piecesRefOk = true;
        piecesRefDetail = `${numerosRefs.length} référence(s) de pièces vérifiée(s), toutes valides`;
      }
    }
    controles.push(controler(10, 'Pièces référencées valides', piecesRefOk, piecesRefDetail));

    // 11. Contradictions non résolues critiques
    const contradictionsCritiques = contradictions.filter(c => c.gravite === 'critique' || c.gravite === 'haute');
    let contradOk = contradictionsCritiques.length === 0 ? true : null;
    controles.push(controler(11, 'Contradictions critiques non résolues',
      contradOk,
      contradictionsCritiques.length > 0
        ? `${contradictionsCritiques.length} contradiction(s) de gravité critique ou haute non résolue(s)`
        : 'Aucune contradiction critique détectée'));

    // 12. Pièces manquantes priorité élevée
    const manquantesHautes = manquantes.filter(m => m.priorite === 'haute' || m.priorite === 'critique');
    let manquantesOk = manquantesHautes.length === 0 ? true : null;
    controles.push(controler(12, 'Pièces manquantes priorité élevée',
      manquantesOk,
      manquantesHautes.length > 0
        ? `${manquantesHautes.length} pièce(s) manquante(s) de priorité élevée : ${manquantesHautes.map(m => m.type_piece_attendue).join(', ')}`
        : 'Aucune pièce manquante de priorité élevée'));

    // === CONTROLES IA (optionnels) ===
    if (useIA) {
      try {
        const systemPrompt = `Vous êtes un vérificateur juridique expert en droit du travail et prud'hommes.
Analysez le document juridique suivant et répondez en JSON avec trois champs :
- coherence_juridique : string (évaluation de la cohérence juridique globale)
- articles_valides : boolean (les articles du Code du travail cités existent-ils tous ?)
- ton_correct : boolean (le vouvoiement est-il respecté, le ton est-il professionnel ?)
Répondez UNIQUEMENT en JSON valide, sans markdown.`;

        const userPrompt = `Document à vérifier :\n\n${html.substring(0, 6000)}`;
        const iaResult = await dispatch('full_analysis', systemPrompt, userPrompt, { maxTokens: 1500 });

        let iaData = {};
        try {
          const raw = (iaResult && iaResult.result) ? iaResult.result : (typeof iaResult === 'string' ? iaResult : '');
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) iaData = JSON.parse(jsonMatch[0]);
        } catch { /* parsing IA échoué, on continue */ }

        // 13. Cohérence juridique
        controles.push(controler(13, 'Cohérence juridique (IA)',
          iaData.coherence_juridique ? true : null,
          iaData.coherence_juridique || 'Analyse IA non concluante'));

        // 14. Articles Code du travail
        controles.push(controler(14, 'Articles du Code du travail valides (IA)',
          iaData.articles_valides === true ? true : (iaData.articles_valides === false ? false : null),
          iaData.articles_valides === true ? 'Les articles cités sont valides' :
            iaData.articles_valides === false ? 'Certains articles cités semblent inexistants ou erronés' :
            'Vérification IA non concluante'));

        // 15. Ton et vouvoiement
        controles.push(controler(15, 'Ton et vouvoiement (IA)',
          iaData.ton_correct === true ? true : (iaData.ton_correct === false ? false : null),
          iaData.ton_correct === true ? 'Ton professionnel et vouvoiement respectés' :
            iaData.ton_correct === false ? 'Le ton ou le vouvoiement n\'est pas respecté' :
            'Vérification IA non concluante'));
      } catch (iaErr) {
        controles.push(controler(13, 'Cohérence juridique (IA)', null, 'Analyse IA indisponible'));
        controles.push(controler(14, 'Articles du Code du travail valides (IA)', null, 'Analyse IA indisponible'));
        controles.push(controler(15, 'Ton et vouvoiement (IA)', null, 'Analyse IA indisponible'));
      }
    }

    // === CALCUL SCORE & CLASSIFICATION ===
    const erreursCritiques = controles.filter(c => c.statut === 'erreur');
    const avertissements = controles.filter(c => c.statut === 'attention');
    const oks = controles.filter(c => c.statut === 'ok');

    const totalControles = controles.length;
    const score = Math.round((oks.length / totalControles) * 100);

    const suggestions = [];
    if (!rgPresent) suggestions.push('Ajoutez le numéro RG du dossier dans le document');
    if (!juridictionPresente) suggestions.push('Mentionnez la juridiction compétente (Conseil de prud\'hommes)');
    if (!clientPresent) suggestions.push('Vérifiez que le nom complet du client apparaît dans le document');
    if (!signaturePresente) suggestions.push('Ajoutez la signature avec mention de l\'avocat et du barreau');
    if (estConclusions && !sousReserves) suggestions.push('Ajoutez la mention "SOUS TOUTES RESERVES" dans les conclusions');
    if (estConclusions && !bordereauPresent) suggestions.push('Ajoutez un bordereau de pièces à la fin des conclusions');
    if (manquantesHautes.length > 0) suggestions.push('Rassemblez les pièces manquantes de priorité élevée avant envoi');
    if (contradictionsCritiques.length > 0) suggestions.push('Résolvez les contradictions critiques avant l\'envoi du document');

    return res.json({
      document_id: documentId,
      verification_ok: erreursCritiques.length === 0,
      score_verification: score,
      controles,
      erreurs_critiques: erreursCritiques,
      avertissements,
      suggestions
    });
  } catch (err) {
    console.error('[Vérification document]', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification du document' });
  }
});

// ================================================
// POST /verifier-dossier/:dossierId — Vérification globale dossier
// ================================================
router.post('/verifier-dossier/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Charger dossier
    const { data: dossier, error: dossierErr } = await admin()
      .from('avocat_dossiers')
      .select('*')
      .eq('id', dossierId)
      .single();

    if (dossierErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    // Charger toutes les données en parallèle
    const [piecesRes, timelineRes, contradictionsRes, manquantesRes, analysesRes] = await Promise.all([
      admin().from('avocat_pieces').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_timeline_events').select('*').eq('dossier_id', dossierId).order('date_evenement', { ascending: true }),
      admin().from('avocat_contradictions').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_pieces_manquantes').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_analyses').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: false })
    ]);

    const pieces = piecesRes.data || [];
    const timeline = timelineRes.data || [];
    const contradictions = contradictionsRes.data || [];
    const manquantes = manquantesRes.data || [];
    const analyses = analysesRes.data || [];

    const controles = [];
    const recommandations = [];

    // 1. Toutes les pièces numérotées
    const piecesNonNumerotees = pieces.filter(p => !p.nom_fichier);
    controles.push(controler(1, 'Pièces numérotées',
      piecesNonNumerotees.length === 0,
      piecesNonNumerotees.length === 0
        ? `${pieces.length} pièce(s) correctement numérotée(s)`
        : `${piecesNonNumerotees.length} pièce(s) sans numérotation`));

    // 2. Bordereau à jour
    const dernierDoc = await admin()
      .from('avocat_documents_generes')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const bordereauAJour = dernierDoc.data && dernierDoc.data.contenu_html &&
      /bordereau/i.test(dernierDoc.data.contenu_html);
    controles.push(controler(2, 'Bordereau à jour',
      bordereauAJour ? true : null,
      bordereauAJour ? 'Un bordereau de pièces est présent dans le dernier document' : 'Vérifiez que le bordereau de pièces est à jour'));

    // 3. Timeline cohérente
    let timelineOk = true;
    let timelineDetail = 'Chronologie cohérente';
    const now = new Date();
    for (const evt of timeline) {
      if (new Date(evt.date_evenement) > now) {
        timelineOk = false;
        timelineDetail = 'Des événements sont datés dans le futur';
        break;
      }
    }
    if (timelineOk && timeline.length >= 2) {
      for (let i = 1; i < timeline.length; i++) {
        const prev = new Date(timeline[i - 1].date_evenement);
        const curr = new Date(timeline[i].date_evenement);
        const diffJours = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffJours > 365) {
          timelineOk = null; // attention
          timelineDetail = `Trou de plus d'un an détecté dans la chronologie (entre ${timeline[i - 1].date_evenement} et ${timeline[i].date_evenement})`;
          break;
        }
      }
    }
    controles.push(controler(3, 'Cohérence de la chronologie', timelineOk, timelineDetail));

    // 4. Contradictions critiques non résolues
    const contradCritiques = contradictions.filter(c => c.gravite === 'critique' || c.gravite === 'haute');
    controles.push(controler(4, 'Contradictions critiques non résolues',
      contradCritiques.length === 0,
      contradCritiques.length === 0
        ? 'Aucune contradiction critique'
        : `${contradCritiques.length} contradiction(s) critique(s) non résolue(s)`));
    if (contradCritiques.length > 0) {
      recommandations.push('Résolvez les contradictions critiques avant l\'audience');
    }

    // 5. Pièces manquantes priorité élevée
    const manquantesHautes = manquantes.filter(m => m.priorite === 'haute' || m.priorite === 'critique');
    controles.push(controler(5, 'Pièces manquantes priorité élevée',
      manquantesHautes.length === 0,
      manquantesHautes.length === 0
        ? 'Toutes les pièces prioritaires sont réunies'
        : `${manquantesHautes.length} pièce(s) manquante(s) : ${manquantesHautes.map(m => m.type_piece_attendue).join(', ')}`));
    if (manquantesHautes.length > 0) {
      recommandations.push('Récupérez les pièces manquantes de priorité élevée');
    }

    // 6. Scoring dossier
    let scoreDossier = null;
    const derniereAnalyseScoring = analyses.find(a => a.type_analyse === 'scoring' || a.type_analyse === 'score');
    if (derniereAnalyseScoring) {
      try {
        const resultat = typeof derniereAnalyseScoring.resultat === 'string'
          ? JSON.parse(derniereAnalyseScoring.resultat)
          : derniereAnalyseScoring.resultat;
        scoreDossier = resultat.score || resultat.score_global || null;
      } catch { /* pas de score exploitable */ }
    }
    if (scoreDossier !== null && scoreDossier < 40) {
      controles.push(controler(6, 'Scoring de solidité du dossier', false,
        `Score de solidité : ${scoreDossier}/100 — dossier fragile`));
      recommandations.push('Le score de solidité est inférieur à 40 : renforcez le dossier avant l\'audience');
    } else if (scoreDossier !== null) {
      controles.push(controler(6, 'Scoring de solidité du dossier', true,
        `Score de solidité : ${scoreDossier}/100`));
    } else {
      controles.push(controler(6, 'Scoring de solidité du dossier', null,
        'Aucun scoring disponible — lancez une analyse de solidité'));
      recommandations.push('Lancez une analyse de solidité du dossier');
    }

    // 7. Dernière analyse > 30 jours
    const derniereAnalyse = analyses[0];
    if (derniereAnalyse) {
      const joursDepuis = Math.floor((Date.now() - new Date(derniereAnalyse.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (joursDepuis > 30) {
        controles.push(controler(7, 'Fraîcheur de la dernière analyse', null,
          `Dernière analyse il y a ${joursDepuis} jours — nous vous recommandons de la recalculer`));
        recommandations.push('Relancez une analyse du dossier (la dernière date de plus de 30 jours)');
      } else {
        controles.push(controler(7, 'Fraîcheur de la dernière analyse', true,
          `Dernière analyse il y a ${joursDepuis} jour(s)`));
      }
    } else {
      controles.push(controler(7, 'Fraîcheur de la dernière analyse', null,
        'Aucune analyse disponible pour ce dossier'));
      recommandations.push('Lancez une première analyse du dossier');
    }

    // Score global
    const erreurs = controles.filter(c => c.statut === 'erreur');
    const attentions = controles.filter(c => c.statut === 'attention');
    const oks = controles.filter(c => c.statut === 'ok');
    const scoreGlobal = Math.round((oks.length / controles.length) * 100);

    return res.json({
      dossier_id: dossierId,
      reference: dossier.reference,
      titre: dossier.titre,
      verification_ok: erreurs.length === 0,
      score_verification: scoreGlobal,
      controles,
      erreurs_critiques: erreurs,
      avertissements: attentions,
      recommandations,
      resume: {
        pieces_total: pieces.length,
        evenements_timeline: timeline.length,
        contradictions_total: contradictions.length,
        contradictions_critiques: contradCritiques.length,
        pieces_manquantes: manquantes.length,
        pieces_manquantes_prioritaires: manquantesHautes.length,
        score_solidite: scoreDossier
      }
    });
  } catch (err) {
    console.error('[Vérification dossier]', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification du dossier' });
  }
});

// ================================================
// POST /verifier-pieces/:dossierId — Complétude pièces par domaine
// ================================================
router.post('/verifier-pieces/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Charger dossier
    const { data: dossier, error: dossierErr } = await admin()
      .from('avocat_dossiers')
      .select('*')
      .eq('id', dossierId)
      .single();

    if (dossierErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const domaine = normaliserDomaine(dossier.domaine);
    if (!domaine || !PIECES_PAR_DOMAINE[domaine]) {
      return res.json({
        dossier_id: dossierId,
        domaine: dossier.domaine,
        domaine_reconnu: false,
        message: 'Le domaine du dossier ne correspond pas à un type de contentieux reconnu. Les domaines supportés sont : licenciement, harcèlement, heures supplémentaires, inaptitude.',
        pieces_presentes: [],
        pieces_manquantes: [],
        completude: 0
      });
    }

    // Charger les pièces du dossier
    const { data: pieces } = await admin()
      .from('avocat_pieces')
      .select('*')
      .eq('dossier_id', dossierId);

    const piecesDossier = pieces || [];
    const piecesAttendues = PIECES_PAR_DOMAINE[domaine];

    // Matching pièces existantes avec pièces attendues
    const piecesPresentes = [];
    const piecesManquantes = [];

    for (const attendue of piecesAttendues) {
      const trouvee = piecesDossier.find(p => {
        const typePiece = (p.type_piece || '').toLowerCase();
        const nomFichier = (p.nom_fichier || '').toLowerCase();
        const typeAttendu = attendue.type.toLowerCase();
        const labelAttendu = attendue.label.toLowerCase();
        return typePiece.includes(typeAttendu) ||
               nomFichier.includes(typeAttendu) ||
               typePiece.includes(labelAttendu) ||
               nomFichier.includes(labelAttendu);
      });

      if (trouvee) {
        piecesPresentes.push({
          type_attendu: attendue.type,
          label: attendue.label,
          priorite: attendue.priorite,
          piece_trouvee: trouvee.nom_fichier,
          piece_id: trouvee.id
        });
      } else {
        piecesManquantes.push({
          type_attendu: attendue.type,
          label: attendue.label,
          priorite: attendue.priorite
        });
      }
    }

    const completude = piecesAttendues.length > 0
      ? Math.round((piecesPresentes.length / piecesAttendues.length) * 100)
      : 0;

    const manquantesHautes = piecesManquantes.filter(p => p.priorite === 'haute');

    return res.json({
      dossier_id: dossierId,
      domaine: dossier.domaine,
      domaine_reconnu: true,
      domaine_normalise: domaine,
      pieces_attendues_total: piecesAttendues.length,
      pieces_presentes: piecesPresentes,
      pieces_manquantes: piecesManquantes,
      pieces_manquantes_prioritaires: manquantesHautes,
      completude,
      verification_ok: manquantesHautes.length === 0,
      message: completude === 100
        ? 'Toutes les pièces attendues sont présentes dans le dossier.'
        : completude >= 70
          ? `Le dossier est complété à ${completude}%. Quelques pièces complémentaires seraient utiles.`
          : completude >= 40
            ? `Le dossier est complété à ${completude}% seulement. Des pièces importantes manquent.`
            : `Le dossier est très incomplet (${completude}%). Nous vous recommandons de rassembler les pièces manquantes avant toute audience.`
    });
  } catch (err) {
    console.error('[Vérification pièces]', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification des pièces' });
  }
});

// ================================================
// GET /rapport/:dossierId — Rapport HTML de vérification
// ================================================
router.get('/rapport/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Charger dossier + client
    const { data: dossier, error: dossierErr } = await admin()
      .from('avocat_dossiers')
      .select('*')
      .eq('id', dossierId)
      .single();

    if (dossierErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const { data: client } = await admin()
      .from('avocat_clients')
      .select('*')
      .eq('id', dossier.client_id)
      .single();

    // Charger toutes les données
    const [piecesRes, timelineRes, contradictionsRes, manquantesRes, analysesRes, docsRes] = await Promise.all([
      admin().from('avocat_pieces').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_timeline_events').select('*').eq('dossier_id', dossierId).order('date_evenement', { ascending: true }),
      admin().from('avocat_contradictions').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_pieces_manquantes').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_analyses').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: false }),
      admin().from('avocat_documents_generes').select('*').eq('dossier_id', dossierId)
    ]);

    const pieces = piecesRes.data || [];
    const timeline = timelineRes.data || [];
    const contradictions = contradictionsRes.data || [];
    const manquantes = manquantesRes.data || [];
    const analyses = analysesRes.data || [];
    const documents = docsRes.data || [];

    const contradCritiques = contradictions.filter(c => c.gravite === 'critique' || c.gravite === 'haute');
    const manquantesHautes = manquantes.filter(m => m.priorite === 'haute' || m.priorite === 'critique');
    const clientNom = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Non renseigné';

    const dateRapport = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    // Score global simplifié
    let alertes = 0;
    if (contradCritiques.length > 0) alertes += contradCritiques.length;
    if (manquantesHautes.length > 0) alertes += manquantesHautes.length;
    const scoreBase = 100 - (alertes * 10);
    const scoreGlobal = Math.max(0, Math.min(100, scoreBase));

    const scoreColor = scoreGlobal >= 70 ? '#10b981' : scoreGlobal >= 40 ? '#f59e0b' : '#ef4444';
    const scoreLabel = scoreGlobal >= 70 ? 'Satisfaisant' : scoreGlobal >= 40 ? 'A renforcer' : 'Insuffisant';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de vérification — Dossier ${dossier.reference || dossierId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    h2 { font-size: 18px; font-weight: 600; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    h3 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #1a1a2e; }
    .header-left { flex: 1; }
    .header-right { text-align: right; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 4px; }
    .score-badge { display: inline-block; padding: 12px 24px; border-radius: 12px; color: #fff; font-size: 28px; font-weight: 700; }
    .score-label { font-size: 13px; color: #6b7280; margin-top: 4px; text-align: center; }
    .resume { background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .resume-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px; }
    .resume-item { text-align: center; }
    .resume-value { font-size: 28px; font-weight: 700; }
    .resume-label { font-size: 12px; color: #6b7280; }
    .section { margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 12px; background: #f3f4f6; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-ok { background: #d1fae5; color: #065f46; }
    .badge-erreur { background: #fee2e2; color: #991b1b; }
    .badge-attention { background: #fef3c7; color: #92400e; }
    .badge-haute { background: #fee2e2; color: #991b1b; }
    .badge-moyenne { background: #fef3c7; color: #92400e; }
    .badge-basse { background: #e0f2fe; color: #075985; }
    .reco-list { list-style: none; padding: 0; }
    .reco-list li { padding: 10px 16px; margin-bottom: 8px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; font-size: 14px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Rapport de vérification</h1>
      <p class="meta">Dossier : ${dossier.reference || 'N/A'} — ${dossier.titre || 'Sans titre'}</p>
      <p class="meta">Client : ${clientNom}</p>
      <p class="meta">Domaine : ${dossier.domaine || 'Non précisé'}</p>
      <p class="meta">Date du rapport : ${dateRapport}</p>
    </div>
    <div class="header-right">
      <div class="score-badge" style="background:${scoreColor}">${scoreGlobal}</div>
      <div class="score-label">${scoreLabel}</div>
    </div>
  </div>

  <div class="resume">
    <h3>Résumé exécutif</h3>
    <div class="resume-grid">
      <div class="resume-item">
        <div class="resume-value">${pieces.length}</div>
        <div class="resume-label">Pièces au dossier</div>
      </div>
      <div class="resume-item">
        <div class="resume-value">${timeline.length}</div>
        <div class="resume-label">Événements chronologie</div>
      </div>
      <div class="resume-item">
        <div class="resume-value">${documents.length}</div>
        <div class="resume-label">Documents générés</div>
      </div>
      <div class="resume-item">
        <div class="resume-value" style="color:${contradCritiques.length > 0 ? '#ef4444' : '#10b981'}">${contradCritiques.length}</div>
        <div class="resume-label">Contradictions critiques</div>
      </div>
      <div class="resume-item">
        <div class="resume-value" style="color:${manquantesHautes.length > 0 ? '#ef4444' : '#10b981'}">${manquantesHautes.length}</div>
        <div class="resume-label">Pièces manquantes (priorité haute)</div>
      </div>
      <div class="resume-item">
        <div class="resume-value">${analyses.length}</div>
        <div class="resume-label">Analyses effectuées</div>
      </div>
    </div>
  </div>

  ${pieces.length > 0 ? `
  <div class="section">
    <h2>Pièces du dossier</h2>
    <table>
      <thead><tr><th>#</th><th>Nom du fichier</th><th>Type</th><th>Importance</th></tr></thead>
      <tbody>
        ${pieces.map((p, i) => `<tr>
          <td>${i + 1}</td>
          <td>${p.nom_fichier || 'Non renseigné'}</td>
          <td>${p.type_piece || '-'}</td>
          <td><span class="badge badge-${(p.importance || 'moyenne').toLowerCase()}">${p.importance || 'moyenne'}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${contradictions.length > 0 ? `
  <div class="section">
    <h2>Contradictions détectées</h2>
    <table>
      <thead><tr><th>Description</th><th>Gravité</th></tr></thead>
      <tbody>
        ${contradictions.map(c => `<tr>
          <td>${c.description || '-'}</td>
          <td><span class="badge badge-${c.gravite === 'critique' || c.gravite === 'haute' ? 'erreur' : 'attention'}">${c.gravite || '-'}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${manquantes.length > 0 ? `
  <div class="section">
    <h2>Pièces manquantes</h2>
    <table>
      <thead><tr><th>Pièce attendue</th><th>Priorité</th></tr></thead>
      <tbody>
        ${manquantes.map(m => `<tr>
          <td>${m.type_piece_attendue || '-'}</td>
          <td><span class="badge badge-${m.priorite === 'haute' || m.priorite === 'critique' ? 'erreur' : 'attention'}">${m.priorite || '-'}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${(() => {
    const recos = [];
    if (contradCritiques.length > 0) recos.push('Résolvez les contradictions critiques identifiées avant toute audience ou dépôt de conclusions.');
    if (manquantesHautes.length > 0) recos.push('Rassemblez les pièces manquantes de priorité haute pour consolider le dossier.');
    if (analyses.length === 0) recos.push('Lancez une première analyse de solidité du dossier.');
    if (analyses.length > 0) {
      const jours = Math.floor((Date.now() - new Date(analyses[0].created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (jours > 30) recos.push('La dernière analyse date de plus de 30 jours. Nous vous recommandons de la recalculer.');
    }
    if (pieces.length === 0) recos.push('Aucune pièce n\'a été ajoutée au dossier. Commencez par importer les documents essentiels.');
    if (timeline.length === 0) recos.push('La chronologie du dossier est vide. Reconstituez les faits pour structurer votre argumentaire.');
    if (scoreGlobal < 40) recos.push('Le score global du dossier est faible. Un renforcement significatif est nécessaire avant toute procédure.');
    return recos.length > 0 ? `
  <div class="section">
    <h2>Recommandations</h2>
    <ul class="reco-list">
      ${recos.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>` : '';
  })()}

  <div class="footer">
    <p>Rapport généré par JADOMI — Système de vérification documentaire</p>
    <p>${dateRapport}</p>
  </div>
</body>
</html>`;

    return res.json({
      dossier_id: dossierId,
      reference: dossier.reference,
      format: 'html',
      contenu_html: html,
      score_global: scoreGlobal,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Rapport vérification]', err);
    return res.status(500).json({ error: 'Erreur lors de la génération du rapport' });
  }
});

module.exports = router;
