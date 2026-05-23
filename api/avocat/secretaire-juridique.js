// =============================================
// JADOMI AVOCAT — Secrétaire Juridique
// Commandes rapides de génération documentaire
// Templates prud'homaux + IA Mistral RGPD
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { getTemplate } = require('../../lib/legal-providers/templates-prudhomaux');
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
  } catch { return res.status(401).json({ error: 'Auth échouée' }); }
}

// =============================================
// COMMANDES RAPIDES — Définitions
// =============================================
const COMMANDES = [
  {
    id: 'demande_renvoi',
    nom: 'Demande de renvoi',
    description: 'Préparer une demande de renvoi d\'audience devant le Conseil de prud\'hommes',
    variables_requises: ['date_audience', 'motif_renvoi', 'juridiction'],
    icone_emoji_code: 'U+1F4C5',
    source: 'template'
  },
  {
    id: 'substitution',
    nom: 'Substitution d\'avocat',
    description: 'Préparer un courrier de substitution d\'avocat pour une audience',
    variables_requises: ['date_audience', 'avocat_nom', 'remplacant_nom'],
    icone_emoji_code: 'U+1F465',
    source: 'ia'
  },
  {
    id: 'requete_cph',
    nom: 'Requête introductive CPH',
    description: 'Préparer une requête introductive d\'instance devant le Conseil de prud\'hommes',
    variables_requises: ['juridiction', 'section', 'date_embauche', 'date_rupture', 'poste', 'salaire_brut', 'convention_collective', 'motif_saisine', 'demandes_chiffrees', 'rappel_des_faits'],
    icone_emoji_code: 'U+2696',
    source: 'template'
  },
  {
    id: 'conclusions',
    nom: 'Conclusions au fond',
    description: 'Préparer des conclusions en demande ou en défense devant le CPH',
    variables_requises: ['juridiction', 'section', 'rg_numero', 'moyens_droit', 'demandes_chiffrees'],
    icone_emoji_code: 'U+1F4DD',
    source: 'template'
  },
  {
    id: 'courrier_client',
    nom: 'Courrier client',
    description: 'Préparer un courrier à destination du client',
    variables_requises: ['objet_courrier'],
    icone_emoji_code: 'U+2709',
    source: 'template'
  },
  {
    id: 'courrier_confrere',
    nom: 'Courrier au confrère adverse',
    description: 'Préparer un courrier confraternité au confrère adverse',
    variables_requises: ['confrere_nom', 'objet_courrier'],
    icone_emoji_code: 'U+1F4E8',
    source: 'template'
  },
  {
    id: 'bordereau',
    nom: 'Bordereau de pièces',
    description: 'Préparer un bordereau de communication de pièces',
    variables_requises: [],
    icone_emoji_code: 'U+1F4CB',
    source: 'template'
  },
  {
    id: 'transmission',
    nom: 'Transmission de pièces',
    description: 'Préparer une lettre de transmission de pièces au conseil adverse',
    variables_requises: ['confrere_nom'],
    icone_emoji_code: 'U+1F4E4',
    source: 'ia'
  },
  {
    id: 'mail_rpva',
    nom: 'Mail RPVA',
    description: 'Préparer un message via le Réseau Privé Virtuel Avocat',
    variables_requises: ['rg_numero'],
    icone_emoji_code: 'U+1F4E7',
    source: 'ia'
  },
  {
    id: 'mise_en_demeure',
    nom: 'Mise en demeure',
    description: 'Préparer une mise en demeure à l\'employeur',
    variables_requises: ['objet_mise_en_demeure', 'delai_jours'],
    icone_emoji_code: 'U+26A0',
    source: 'template'
  },
  {
    id: 'note_audience',
    nom: 'Note d\'audience',
    description: 'Préparer une note d\'audience avec les points clés à plaider',
    variables_requises: ['date_audience'],
    icone_emoji_code: 'U+1F4D3',
    source: 'template'
  },
  {
    id: 'convocation',
    nom: 'Convocation d\'entretien',
    description: 'Préparer une convocation d\'entretien préalable au licenciement',
    variables_requises: ['date_entretien', 'lieu', 'employeur_nom'],
    icone_emoji_code: 'U+1F4E9',
    source: 'ia'
  }
];

// IDs qui utilisent les templates prud'homaux
const TEMPLATE_IDS = ['requete_cph', 'conclusions', 'bordereau', 'mise_en_demeure', 'courrier_client', 'courrier_confrere', 'note_audience', 'demande_renvoi'];

// Prompts spécialisés pour les commandes IA (sans template)
const PROMPTS_IA = {
  substitution: 'Rédigez un courrier de substitution d\'avocat pour l\'audience du {{date_audience}}. L\'avocat {{avocat_nom}} sera remplacé par Maître {{remplacant_nom}}. Dossier {{reference}} — {{client_nom}} c/ {{employeur_nom}}. Format : courrier au greffe CPH.',
  transmission: 'Rédigez une lettre de transmission de pièces au conseil adverse. Dossier {{reference}}. Pièces transmises : {{pieces_liste}}. Format : courrier confraternité.',
  mail_rpva: 'Rédigez un message RPVA (Réseau Privé Virtuel Avocat) pour transmettre les pièces/conclusions au greffe. Dossier {{reference}}, RG {{rg_numero}}. Format : message court, professionnel.',
  convocation: 'Rédigez une convocation d\'entretien préalable au licenciement. Employeur {{employeur_nom}}, salarié {{client_nom}}. Date : {{date_entretien}}. Lieu : {{lieu}}. Mention du droit de se faire assister (art. L.1232-4 du Code du travail).'
};

// =============================================
// HELPERS
// =============================================

/**
 * Charge un dossier complet avec client et pièces
 */
async function chargerDossierComplet(dossierId, societeId) {
  const { data: dossier, error: errD } = await admin()
    .from('avocat_dossiers')
    .select('*')
    .eq('id', dossierId)
    .eq('avocat_societe_id', societeId)
    .single();

  if (errD || !dossier) return null;

  const [clientRes, piecesRes] = await Promise.all([
    dossier.client_id
      ? admin().from('avocat_clients').select('*').eq('id', dossier.client_id).single()
      : Promise.resolve({ data: null }),
    admin().from('avocat_pieces').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: true })
  ]);

  return {
    ...dossier,
    client: clientRes.data || null,
    pieces: piecesRes.data || []
  };
}

/**
 * Pré-remplit les variables depuis le dossier
 */
function preRemplirVariables(dossier, parametres) {
  const vars = { ...parametres };

  // Depuis le client
  if (dossier.client) {
    if (!vars.client_nom) vars.client_nom = `${dossier.client.prenom || ''} ${dossier.client.nom || ''}`.trim();
    if (!vars.client_prenom) vars.client_prenom = dossier.client.prenom || '';
    if (!vars.client_adresse) vars.client_adresse = dossier.client.adresse || '';
    if (!vars.client_email) vars.client_email = dossier.client.email || '';
    if (!vars.client_telephone) vars.client_telephone = dossier.client.telephone || '';
  }

  // Depuis le dossier
  if (!vars.reference) vars.reference = dossier.reference || '';
  if (!vars.titre) vars.titre = dossier.titre || '';
  if (!vars.type) vars.type = dossier.type || '';
  if (!vars.domaine) vars.domaine = dossier.domaine || '';
  if (!vars.etape) vars.etape = dossier.etape || '';

  // Pièces : liste formatée
  if (!vars.pieces_liste && dossier.pieces && dossier.pieces.length > 0) {
    vars.pieces_liste = dossier.pieces.map((p, i) => `Pièce ${i + 1} : ${p.nom_fichier} (${p.type_piece || 'non classée'})`).join('\n');
  }

  return vars;
}

/**
 * Remplace les {{variables}} dans un texte
 */
function injecterVariables(texte, variables) {
  return texte.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined && variables[key] !== '' ? variables[key] : match;
  });
}

/**
 * Exécute une commande unique
 */
async function executerCommande(commandeId, dossier, parametres) {
  const commande = COMMANDES.find(c => c.id === commandeId);
  if (!commande) throw new Error(`Commande inconnue : ${commandeId}`);

  const variables = preRemplirVariables(dossier, parametres || {});
  let document_html;
  let source;

  if (TEMPLATE_IDS.includes(commandeId)) {
    // Génération via template prud'homal
    const template = getTemplate(commandeId);
    if (!template) throw new Error(`Template introuvable : ${commandeId}`);
    document_html = injecterVariables(template.contenu, variables);
    source = 'template';
  } else {
    // Génération via IA Mistral (RGPD)
    const promptTemplate = PROMPTS_IA[commandeId];
    if (!promptTemplate) throw new Error(`Prompt IA introuvable : ${commandeId}`);

    const userPrompt = injecterVariables(promptTemplate, variables);
    const systemPrompt = 'Vous êtes un assistant juridique spécialisé en droit du travail et prud\'hommes. '
      + 'Rédigez le document demandé en français juridique correct, avec vouvoiement. '
      + 'Format HTML structuré. Ne citez que des articles de loi réels. '
      + 'Soyez précis, professionnel et concis.';

    const result = await dispatch('summarize_dossier', systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.3
    });

    document_html = result.result || '';
    source = 'ia';
  }

  return {
    commande_id: commandeId,
    document_html,
    variables_utilisees: variables,
    source
  };
}

// =============================================
// GET /commandes — Liste des commandes rapides
// =============================================
router.get('/commandes', requireAvocat, async (req, res) => {
  try {
    const liste = COMMANDES.map(c => ({
      id: c.id,
      nom: c.nom,
      description: c.description,
      variables_requises: c.variables_requises,
      icone_emoji_code: c.icone_emoji_code
    }));
    res.json({ commandes: liste, total: liste.length });
  } catch (err) {
    console.error('[secretaire-juridique] Erreur /commandes:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des commandes' });
  }
});

// =============================================
// POST /executer — Exécuter une commande
// =============================================
router.post('/executer', requireAvocat, async (req, res) => {
  try {
    const { commande_id, dossier_id, parametres } = req.body;
    if (!commande_id) return res.status(400).json({ error: 'commande_id requis' });
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    const commande = COMMANDES.find(c => c.id === commande_id);
    if (!commande) return res.status(404).json({ error: `Commande inconnue : ${commande_id}` });

    const dossier = await chargerDossierComplet(dossier_id, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });

    const resultat = await executerCommande(commande_id, dossier, parametres || {});
    res.json(resultat);
  } catch (err) {
    console.error('[secretaire-juridique] Erreur /executer:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du document' });
  }
});

// =============================================
// POST /executer-batch — Exécuter plusieurs commandes
// =============================================
router.post('/executer-batch', requireAvocat, async (req, res) => {
  try {
    const { commande_ids, dossier_id } = req.body;
    if (!commande_ids || !Array.isArray(commande_ids) || commande_ids.length === 0) {
      return res.status(400).json({ error: 'commande_ids requis (tableau non vide)' });
    }
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    // Vérifier que toutes les commandes existent
    for (const cid of commande_ids) {
      if (!COMMANDES.find(c => c.id === cid)) {
        return res.status(404).json({ error: `Commande inconnue : ${cid}` });
      }
    }

    const dossier = await chargerDossierComplet(dossier_id, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });

    const resultats = await Promise.all(
      commande_ids.map(cid => executerCommande(cid, dossier, {}).catch(err => ({
        commande_id: cid,
        document_html: null,
        variables_utilisees: {},
        source: null,
        erreur: err.message
      })))
    );

    res.json({ resultats, total: resultats.length });
  } catch (err) {
    console.error('[secretaire-juridique] Erreur /executer-batch:', err);
    res.status(500).json({ error: 'Erreur lors de la génération en lot' });
  }
});

// =============================================
// POST /personnaliser/:commandeId — Personnaliser un document
// =============================================
router.post('/personnaliser/:commandeId', requireAvocat, async (req, res) => {
  try {
    const { commandeId } = req.params;
    const { document_html, instructions } = req.body;

    if (!document_html) return res.status(400).json({ error: 'document_html requis' });
    if (!instructions) return res.status(400).json({ error: 'instructions requises' });

    const commande = COMMANDES.find(c => c.id === commandeId);
    if (!commande) return res.status(404).json({ error: `Commande inconnue : ${commandeId}` });

    const systemPrompt = 'Vous êtes un assistant juridique spécialisé en droit du travail. '
      + 'L\'avocat vous transmet un document juridique déjà rédigé et des instructions de personnalisation. '
      + 'Modifiez le document selon les instructions tout en conservant le format HTML, '
      + 'le vouvoiement et la rigueur juridique. Ne citez que des articles de loi réels.';

    const userPrompt = `Document actuel :\n${document_html}\n\nInstructions de personnalisation :\n${instructions}\n\nRetournez le document modifié en HTML.`;

    const result = await dispatch('summarize_dossier', systemPrompt, userPrompt, {
      maxTokens: 3000,
      temperature: 0.3
    });

    res.json({
      commande_id: commandeId,
      document_html: result.result || '',
      source: 'ia_personnalise'
    });
  } catch (err) {
    console.error('[secretaire-juridique] Erreur /personnaliser:', err);
    res.status(500).json({ error: 'Erreur lors de la personnalisation du document' });
  }
});

module.exports = router;
