// =============================================
// JADOMI MAIL SCORER — Moteur de scoring local
// Classification intelligente 100% gratuite
//
// 5 couches de scoring :
// 1. SPAM DETECTOR — score 0-100, seuil 60
// 2. NEWSLETTER DETECTOR — headers + patterns
// 3. SENDER REPUTATION — connu / inconnu / fréquent
// 4. CATEGORY CLASSIFIER — 12 catégories par mots-clés pondérés
// 5. PRIORITY CALCULATOR — multi-critères
//
// Coût : 0€ — aucune IA, aucun appel externe
// Performance : < 1ms par mail
// =============================================

// =============================================
// 1. SPAM DETECTOR
// =============================================

const SPAM_KEYWORDS = {
  // Poids élevé (quasi certain spam)
  high: [
    'viagra', 'cialis', 'casino', 'lottery', 'winner', 'congratulations',
    'click here now', 'act now', 'limited time', 'free money', 'make money fast',
    'nigerian prince', 'inheritance', 'bitcoin gratuit', 'crypto gratuit',
    'gagner de l\'argent', 'revenus passifs', 'devenir riche',
    'augmentez votre', 'agrandissement', 'perte de poids rapide',
    'offre exclusive réservée', 'vous avez été sélectionné',
    'cliquez ici pour réclamer', 'répondez immédiatement',
    'compte suspendu', 'votre compte sera fermé', 'vérifiez votre identité',
    'mise à jour de sécurité urgente'
  ],
  // Poids moyen
  medium: [
    'unsubscribe', 'se désinscrire', 'opt-out', 'désabonnement',
    'soldes', 'promotion', 'remise exceptionnelle', 'offre spéciale',
    'dernière chance', 'ne ratez pas', 'plus que', 'vente flash',
    'parrainage', 'code promo', 'réduction', 'bon de réduction',
    'gratuit', 'cadeau offert', 'sans engagement',
    'cliquez ici', 'en savoir plus', 'découvrez',
  ],
  // Poids faible (indicateurs mais pas conclusif)
  low: [
    'newsletter', 'bulletin', 'infolettre', 'actualités',
    'nos offres', 'nouveautés', 'tendances',
  ]
};

// Patterns dans les adresses email spam
const SPAM_SENDER_PATTERNS = [
  /noreply@.*\.(info|xyz|top|club|online|site|click|buzz)/i,
  /marketing@/i,
  /promo@/i,
  /deals@/i,
  /newsletter@(?!doctolib|gacd|henryschein)/i, // newsletter sauf fournisseurs connus
  /\d{6,}@/,  // email avec beaucoup de chiffres
  /@.*\.(ru|cn|tk|ml|ga|cf)$/i, // TLD suspects
];

// Domaines légitimes du monde dentaire/médical (jamais spam)
const TRUSTED_DOMAINS = [
  'gacd.fr', 'henryschein.fr', 'megadental.fr', 'dpi-fr.com', 'septodont.com',
  'anthogyr.com', 'straumann.com', 'doctolib.fr', 'ameli.fr', 'cpam.fr',
  'urssaf.fr', 'impots.gouv.fr', 'service-public.fr', 'ordre-chirurgiens-dentistes.fr',
  'macsf.fr', 'ovh.com', 'ovhcloud.com',
  'impots.gouv.fr', 'dgfip.finances.gouv.fr', 'net-entreprises.fr',
  'ordre-chirurgiens-dentistes.fr', 'oncd.fr',
  'ameli.fr', 'amelipro.fr', 'assurance-maladie.fr',
  'logos-w.fr', 'juliefree.com', 'visiodent.fr', 'ax-s.fr',
  'cic.fr', 'credit-mutuel.fr', 'bnpparibas.fr', 'sg.fr', 'banquepopulaire.fr',
  'caisse-epargne.fr', 'lcl.fr', 'labanquepostale.fr',
  'jadomi.fr', 'dentalevolution.fr',
];

function spamScore(mail) {
  let score = 0;
  const from = (mail.from || '').toLowerCase();
  const fromName = (mail.fromName || '').toLowerCase();
  const subject = (mail.subject || '').toLowerCase();
  const body = (mail.text || '').substring(0, 1000).toLowerCase();
  const all = from + ' ' + fromName + ' ' + subject + ' ' + body;

  // Domaine de confiance → score 0
  const domain = from.split('@')[1] || '';
  if (TRUSTED_DOMAINS.some(d => domain.includes(d))) return { score: 0, is_spam: false, reason: 'domaine de confiance' };

  // Patterns expéditeur suspect
  for (const pattern of SPAM_SENDER_PATTERNS) {
    if (pattern.test(from)) score += 20;
  }

  // Mots-clés spam
  for (const kw of SPAM_KEYWORDS.high) {
    if (all.includes(kw)) score += 30;
  }
  for (const kw of SPAM_KEYWORDS.medium) {
    if (all.includes(kw)) score += 10;
  }
  for (const kw of SPAM_KEYWORDS.low) {
    if (all.includes(kw)) score += 3;
  }

  // CAPS EXCESSIFS dans le sujet (> 50% majuscules)
  if (subject.length > 10) {
    const capsRatio = (subject.replace(/[^A-ZÀ-Ü]/g, '').length) / subject.length;
    if (capsRatio > 0.5) score += 15;
  }

  // Excès de points d'exclamation
  const exclamCount = (subject.match(/!/g) || []).length;
  if (exclamCount >= 3) score += 15;

  // Lien raccourci suspect dans le body
  if (/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly/i.test(body)) score += 10;

  // Beaucoup de liens (> 5)
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount > 5) score += 10;
  if (linkCount > 10) score += 15;

  // Pas de nom d'expéditeur (juste une adresse)
  if (!fromName || fromName === from) score += 5;

  // Sujet vide
  if (!subject || subject === '(sans objet)') score += 5;

  // Cap à 100
  score = Math.min(score, 100);

  return {
    score,
    is_spam: score >= 60,
    is_suspicious: score >= 30 && score < 60,
    reason: score >= 60 ? 'spam détecté (score ' + score + ')' :
            score >= 30 ? 'suspect (score ' + score + ')' : 'légitime'
  };
}

// =============================================
// 2. NEWSLETTER DETECTOR
// =============================================

// Expéditeurs TOUJOURS newsletter/pub (PAS fournisseurs qui envoient aussi des factures)
const KNOWN_NEWSLETTER_SENDERS = [
  'cotizup', 'allomouton', 'allo-mouton',
  'vistaprint', 'cdiscount', 'aliexpress', 'wish.com', 'temu', 'shein',
  'groupon', 'vente-privee', 'showroomprive', 'boulanger.com',
  'lidl', 'auchan', 'carrefour', 'leclerc',
  'blueskybio', 'clearcorrect', 'dekra', 'france-travail',
  'mailchimp.com', 'sendinblue.com', 'mailjet.com', 'hubspot',
];

// Fournisseurs qui envoient des factures ET des pubs — newsletter seulement si PAS facture
const MIXED_SENDERS = [
  'doctorstrong', 'doctor-strong', 'promodentaire', 'godentaire', 'dentalclick',
  'gacd', 'henry-schein', 'mega-dental',
];

function isNewsletter(mail) {
  const from = (mail.from || '').toLowerCase();
  const subject = (mail.subject || '').toLowerCase();
  const body = (mail.text || '').substring(0, 2000).toLowerCase();
  const headers = mail.headers || {};

  let signals = 0;

  // Expéditeur connu = newsletter certaine (pas besoin d'autres signaux)
  if (KNOWN_NEWSLETTER_SENDERS.some(s => from.includes(s))) {
    return { is_newsletter: true, confidence: 1, signals: 10 };
  }

  // Fournisseurs mixtes (factures + pubs) — newsletter seulement si PAS facture/commande
  if (MIXED_SENDERS.some(s => from.includes(s))) {
    const hasInvoiceKeyword = /facture|commande|confirmation|expédition|livraison|n°\s*\d|numéro\s*\d|bon de|avoir|règlement/i.test(subject + ' ' + body);
    if (!hasInvoiceKeyword) {
      return { is_newsletter: true, confidence: 0.9, signals: 8 };
    }
    // C'est un mail transactionnel (facture/commande) → PAS newsletter
  }

  // Headers de liste de diffusion
  if (headers['list-unsubscribe'] || headers['list-id'] || headers['precedence'] === 'bulk') signals += 3;

  // Mot "désinscrire" / "unsubscribe" dans le body
  if (/se désinscrire|désabonnement|unsubscribe|opt.?out|ne plus recevoir/i.test(body)) signals += 2;

  // Expéditeur typique newsletter
  if (/newsletter|bulletin|news@|info@|communication@|marketing@|noreply@/i.test(from)) signals += 2;

  // Sujet typique newsletter
  if (/newsletter|nos (offres|nouveautés|actualités)|cette semaine|ce mois/i.test(subject)) signals += 2;

  // "Voir dans le navigateur" / "version web"
  if (/voir (dans|en) (le|votre) navigateur|version web|voir en ligne/i.test(body)) signals += 2;

  // Pixel de tracking (image 1x1)
  if (mail.html && /width=["']?1["']?\s+height=["']?1["']?|1x1\.gif|pixel\.gif|track(ing)?\.gif/i.test(mail.html)) signals += 1;

  return {
    is_newsletter: signals >= 3,
    confidence: Math.min(signals / 5, 1),
    signals
  };
}

// =============================================
// 3. SENDER REPUTATION (mémoire locale)
// =============================================

// Cache en mémoire des expéditeurs vus (par société)
// En prod, ça se remplit au fur et à mesure des syncs
const senderCache = new Map();

function getSenderKey(societeId, email) {
  return societeId + ':' + (email || '').toLowerCase().trim();
}

function recordSender(societeId, mail) {
  const key = getSenderKey(societeId, mail.from);
  const existing = senderCache.get(key) || { count: 0, lastSeen: null, categories: [], replied: false };
  existing.count++;
  existing.lastSeen = new Date().toISOString();
  senderCache.set(key, existing);
  return existing;
}

function getSenderReputation(societeId, email) {
  const key = getSenderKey(societeId, email);
  const data = senderCache.get(key);
  if (!data) return { known: false, frequency: 'never', trust: 'unknown' };

  const freq = data.count >= 10 ? 'frequent' : data.count >= 3 ? 'regular' : 'rare';
  const trust = data.replied ? 'high' : data.count >= 5 ? 'medium' : 'low';

  return { known: true, frequency: freq, trust, mailCount: data.count, lastSeen: data.lastSeen };
}

function markSenderReplied(societeId, email) {
  const key = getSenderKey(societeId, email);
  const existing = senderCache.get(key) || { count: 1, lastSeen: new Date().toISOString(), categories: [], replied: false };
  existing.replied = true;
  senderCache.set(key, existing);
}

// =============================================
// 4. CATEGORY CLASSIFIER (pondéré, multi-signal)
// =============================================

const CATEGORY_RULES = [
  {
    category: 'fournisseur',
    // Domaines + noms connus
    senderMatch: [
      'gacd', 'henry schein', 'henryschein', 'mega dental', 'megadental',
      'dpi', 'septaline', 'septodont', 'anthogyr', 'straumann',
      'promodentaire', 'dentalclick', 'dental evolution', 'dentalevolution',
      'leone', 'godentaire', 'dentsply', 'kerr', '3m ', 'ivoclar',
      'pierre rolland', 'dental prive', 'cap dentaire', 'gerho',
    ],
    subjectMatch: [],
    weight: 100 // domaine fournisseur = certain
  },
  {
    category: 'comptable',
    senderMatch: ['comptable', 'expert-comptable', 'cabinet-comptable', 'fiduciaire', 'ec-'],
    subjectMatch: ['bilan', 'liasse fiscale', 'déclaration tva', 'déclaration de tva',
      'cotisations sociales', 'urssaf', 'cfe', 'impôt', 'impot', 'résultat comptable',
      'grand livre', 'balance', 'trésorerie', 'rapprochement bancaire',
      'déclaration de revenus', 'charges sociales', 'das2', 'ca12'],
    bodyMatch: ['pièces comptables', 'justificatifs', 'exercice comptable', 'clôture'],
    weight: 80
  },
  {
    category: 'banque',
    senderMatch: ['cic', 'credit-mutuel', 'creditmutuel', 'bnp', 'paribas', 'societe-generale',
      'sg.fr', 'caisse-epargne', 'lcl', 'banquepopulaire', 'labanquepostale',
      'credit-agricole', 'hsbc', 'bred'],
    subjectMatch: ['relevé de compte', 'releve de compte', 'solde', 'virement', 'prélèvement',
      'prelevement', 'découvert', 'agios', 'carte bancaire', 'opposition',
      'emprunt', 'crédit', 'remboursement'],
    weight: 90
  },
  {
    category: 'labo',
    senderMatch: ['laboratoire', 'labo-', 'prothes', 'dental lab'],
    subjectMatch: ['couronne', 'bridge', 'céramique', 'ceramique', 'zircone',
      'empreinte', 'prothèse', 'prothese', 'cas prothétique', 'cas prothetique',
      'facette', 'inlay', 'onlay', 'provisoire', 'essayage', 'livraison cas',
      'cas n°', 'cas numero', 'implant bar'],
    weight: 70
  },
  {
    category: 'patient',
    senderMatch: ['doctolib', 'mondocteur', 'keldoc'],
    subjectMatch: ['rendez-vous', 'rdv', 'annulation', 'confirmation rdv',
      'nouveau message patient', 'avis patient', 'rappel rdv',
      'demande de rendez-vous', 'prise de rdv'],
    weight: 60
  },
  {
    category: 'assurance',
    senderMatch: ['macsf', 'assurance', 'rcp', 'axa', 'allianz', 'generali', 'mma', 'matmut', 'groupama'],
    subjectMatch: ['sinistre', 'attestation', 'responsabilité civile', 'prime d\'assurance',
      'contrat d\'assurance', 'cotisation', 'déclaration de sinistre'],
    weight: 70
  },
  {
    category: 'facture',
    senderMatch: [],
    subjectMatch: ['facture', 'invoice', 'paiement reçu', 'payment', 'règlement',
      'reglement', 'échéance', 'echeance', 'reçu de paiement', 'receipt',
      'avis de paiement', 'quittance', 'avoir'],
    weight: 50
  },
  {
    category: 'juridique',
    senderMatch: ['avocat', 'cabinet-', 'huissier', 'notaire', 'tribunal', 'greffe'],
    subjectMatch: ['mise en demeure', 'assignation', 'contentieux', 'plainte',
      'ordonnance du', 'jugement', 'injonction', 'cnil', 'rgpd', 'ordre des'],
    weight: 80
  },
  {
    category: 'rh',
    senderMatch: ['pole-emploi', 'urssaf', 'pajemploi', 'cesu'],
    subjectMatch: ['bulletin de paie', 'fiche de paie', 'contrat de travail',
      'congés', 'arrêt maladie', 'remplacement', 'recrutement',
      'avenant', 'rupture conventionnelle', 'licenciement', 'démission'],
    weight: 70
  },
  {
    category: 'formation',
    senderMatch: ['learnylib', 'frenchtooth', 'dpc', 'andpc', 'adf', 'sop'],
    subjectMatch: ['formation', 'dpc', 'congrès', 'congres', 'séminaire', 'seminaire',
      'inscription formation', 'attestation de formation', 'certificat dpc',
      'e-learning', 'webinaire', 'webinar'],
    weight: 60
  },
  {
    category: 'ordre',
    senderMatch: ['ordre-chirurgiens-dentistes', 'ordre-dentistes', 'oncd', 'conseil-departemental', 'conseil-national', 'conseil de l\'ordre', 'cdocd'],
    subjectMatch: ['conseil de l\'ordre', 'cotisation ordinale', 'inscription au tableau',
      'obligation déontologique', 'déontologie', 'commission', 'tableau de l\'ordre',
      'attestation ordinale', 'formation continue obligatoire'],
    weight: 85
  },
  {
    category: 'impots',
    senderMatch: ['impots.gouv', 'dgfip', 'finances.gouv', 'tresor-public', 'tresorerie', 'urssaf', 'net-entreprises'],
    subjectMatch: ['impôt', 'impot', 'déclaration de revenus', 'avis d\'imposition',
      'cfe', 'cvae', 'taxe foncière', 'taxe professionnelle', 'tva',
      'prélèvement à la source', 'acompte', 'solde fiscal', 'contrôle fiscal',
      'échéancier', 'rappel fiscal', 'cotisation foncière'],
    weight: 85
  },
  {
    category: 'commercial',
    senderMatch: ['commercial@', 'sales@', 'representant', 'delegue'],
    subjectMatch: ['offre commerciale', 'proposition commerciale', 'tarifs', 'catalogue',
      'rendez-vous commercial', 'démonstration', 'essai gratuit', 'nouveau produit',
      'gamme', 'promotion exclusive', 'conditions spéciales', 'partenariat',
      'représentant', 'délégué', 'visite commerciale'],
    bodyMatch: ['je me permets de vous contacter', 'suite à notre entretien',
      'je suis le représentant', 'je suis commercial', 'notre gamme',
      'tarif préférentiel', 'conditions négociées'],
    weight: 50
  },
  {
    category: 'notaire',
    senderMatch: ['notaire', 'notaires', 'office notarial', 'etude-'],
    subjectMatch: ['acte notarié', 'acte de vente', 'promesse de vente', 'compromis de vente',
      'succession', 'donation', 'procuration', 'sci', 'parts sociales',
      'assemblée générale', 'statuts', 'cession de parts', 'bail commercial',
      'renouvellement bail'],
    weight: 80
  },
  {
    category: 'cpam',
    senderMatch: ['ameli', 'cpam', 'assurance-maladie', 'amelipro', 'sesam-vitale'],
    subjectMatch: ['cpam', 'ameli', 'teletransmission', 'télétransmission', 'fse',
      'feuille de soins', 'remboursement sécu', 'convention', 'avenant conventionnel',
      'nomenclature', 'ccam', 'ngap', 'carte cps', 'sesam vitale'],
    weight: 80
  },
  {
    category: 'mutuelle',
    senderMatch: ['mutuelle', 'complementaire', 'prevoyance', 'madelin'],
    subjectMatch: ['mutuelle', 'complémentaire santé', 'prévoyance', 'madelin',
      'tiers payant', 'prise en charge', 'devis prothétique', 'entente préalable',
      'accord préalable', 'noemie'],
    weight: 60
  },
  {
    category: 'informatique',
    senderMatch: ['logos', 'julie', 'visiodent', 'desmos', 'doctolib', 'ax-s', 'veasy', 'weda', 'ovh', 'microsoft', 'google workspace', 'apple'],
    subjectMatch: ['mise à jour logiciel', 'maintenance', 'licence', 'abonnement',
      'renouvellement', 'support technique', 'panne', 'incident', 'sauvegarde',
      'serveur', 'installation', 'migration'],
    weight: 50
  },
  {
    category: 'immobilier',
    senderMatch: ['bailleur', 'syndic', 'copropriete', 'gestionnaire', 'agence immobiliere', 'foncier'],
    subjectMatch: ['loyer', 'bail', 'quittance de loyer', 'charges locatives',
      'travaux parties communes', 'assemblée copropriété', 'état des lieux',
      'indexation loyer', 'renouvellement bail', 'avenant bail'],
    weight: 60
  },
  {
    category: 'maintenance',
    senderMatch: ['airel', 'a-dec', 'planmeca', 'sirona', 'kavo', 'w&h', 'durr', 'cattani', 'bien-air'],
    subjectMatch: ['maintenance', 'contrat de maintenance', 'révision', 'entretien',
      'panne', 'réparation', 'intervention technique', 'stérilisateur', 'autoclave',
      'compresseur', 'aspiration', 'fauteuil dentaire', 'panoramique'],
    weight: 60
  },
  {
    category: 'urgent',
    senderMatch: [],
    subjectMatch: ['urgent', 'relance', 'rappel', 'impayé', 'impaye',
      'mise en demeure', 'dernier avis', 'délai dépassé', 'action requise',
      'compte suspendu', 'intervention immédiate'],
    weight: 90
  },
];

function classifyMailAdvanced(mail, societeId) {
  const from = ((mail.from || '') + ' ' + (mail.fromName || '')).toLowerCase();
  const subject = (mail.subject || '').toLowerCase();
  const body = (mail.text || '').substring(0, 500).toLowerCase();

  // 1. Newsletter check AVANT spam (les newsletters ont des mots "spam" mais sont légitimes)
  const nl = isNewsletter(mail);
  if (nl.is_newsletter) {
    return { category: 'newsletter', priority: 'none', spam_score: 0, reason: 'newsletter détectée (' + nl.signals + ' signaux)', is_spam: false, is_newsletter: true };
  }

  // 2. Spam check (seulement si pas newsletter)
  const spam = spamScore(mail);
  if (spam.is_spam) {
    return { category: 'spam', priority: 'none', spam_score: spam.score, reason: spam.reason, is_spam: true, is_newsletter: false };
  }

  // 3. Category scoring
  let bestCategory = 'autre';
  let bestScore = 0;
  let bestReason = '';

  for (const rule of CATEGORY_RULES) {
    let matchScore = 0;
    let reason = '';

    // Match sur expéditeur (poids fort)
    for (const kw of rule.senderMatch) {
      if (from.includes(kw)) {
        matchScore += rule.weight;
        reason = 'expéditeur ' + kw;
        break; // 1 match suffit
      }
    }

    // Match sur sujet (poids moyen)
    for (const kw of rule.subjectMatch || []) {
      if (subject.includes(kw)) {
        matchScore += Math.round(rule.weight * 0.7);
        if (!reason) reason = 'sujet contient "' + kw + '"';
        break;
      }
    }

    // Match sur body (poids faible)
    for (const kw of rule.bodyMatch || []) {
      if (body.includes(kw)) {
        matchScore += Math.round(rule.weight * 0.3);
        if (!reason) reason = 'contenu contient "' + kw + '"';
        break;
      }
    }

    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestCategory = rule.category;
      bestReason = reason;
    }
  }

  // 4. Priority
  let priority = 'normal';
  if (bestCategory === 'urgent') priority = 'urgent';
  else if (bestCategory === 'juridique') priority = 'urgent';
  else if (bestCategory === 'comptable') priority = 'high';
  else if (bestCategory === 'banque' && /découvert|impayé|rejet|incident/i.test(subject)) priority = 'urgent';
  else if (bestCategory === 'autre') priority = 'low';
  else if (spam.is_suspicious) priority = 'low';

  // Boost priorité si expéditeur fréquent
  if (societeId) {
    const rep = getSenderReputation(societeId, mail.from);
    if (rep.known && rep.frequency === 'frequent' && priority === 'low') priority = 'normal';
    recordSender(societeId, mail);
  }

  // 5. Détection documents financiers (facture / devis / avoir / relance / bon de commande)
  const hasPdf = (mail.attachments || []).some(a => isPdf(a));
  const financial = detectFinancialDocument(subject, body, mail.attachments);

  // 6. Boost priorité si document financier important
  if (financial.type === 'facture' && priority === 'low') priority = 'normal';
  if (financial.type === 'relance') priority = 'urgent';
  if (financial.type === 'mise_en_demeure') priority = 'urgent';

  // 7. Ne JAMAIS classer un mail important en "autre"
  // Si on a un PDF + un fournisseur/comptable/banque détecté, c'est important
  if (bestCategory === 'autre' && hasPdf && financial.type !== 'inconnu') {
    bestCategory = 'facture';
    bestReason = 'document financier détecté (' + financial.type + ')';
    priority = 'normal';
  }

  // 8. Si l'expéditeur est un domaine de confiance et catégorie = autre, monter en priorité
  const domain = (mail.from || '').split('@')[1] || '';
  if (bestCategory === 'autre' && TRUSTED_DOMAINS.some(d => domain.includes(d))) {
    priority = 'normal';
    bestReason = 'expéditeur de confiance (' + domain + ')';
  }

  // 9. Détection "attend une réponse"
  const response = detectNeedsResponse(mail);
  if (response.needs_response && response.urgency === 'urgent' && priority !== 'urgent') {
    priority = 'urgent';
  } else if (response.needs_response && response.urgency === 'important' && priority === 'low') {
    priority = 'normal';
  }

  return {
    category: bestCategory,
    priority,
    spam_score: spam.score,
    is_spam: false,
    is_newsletter: false,
    is_suspicious: spam.is_suspicious,
    financial: financial,
    has_invoice: financial.type === 'facture',
    has_devis: financial.type === 'devis',
    has_avoir: financial.type === 'avoir',
    has_pdf: hasPdf,
    needs_response: response.needs_response,
    response_urgency: response.urgency,
    response_type: response.response_type,
    response_signals: response.signals,
    confidence: Math.min(bestScore / 100, 1),
    reason: bestReason || 'non classifié',
    sender_known: societeId ? getSenderReputation(societeId, mail.from).known : false
  };
}

// =============================================
// 6. DÉTECTEUR DE DOCUMENTS FINANCIERS
// Différencie : facture, devis, avoir, relance,
// bon de commande, bon de livraison, relevé
// =============================================

function detectFinancialDocument(subject, body, attachments) {
  const sub = (subject || '').toLowerCase();
  const bod = (body || '').substring(0, 1000).toLowerCase();
  const all = sub + ' ' + bod;

  // Noms de pièces jointes
  const filenames = (attachments || []).map(a => (a.filename || '').toLowerCase()).join(' ');

  // Scoring par type de document
  const types = {
    facture: {
      keywords: ['facture', 'invoice', 'facture n°', 'facture no', 'fact-', 'fa-', 'fac_'],
      filenameHints: ['facture', 'invoice', 'fact_', 'fa_', 'fac-'],
      excludeIf: ['proforma', 'pro forma', 'pro-forma'], // proforma = devis, pas facture
      score: 0
    },
    devis: {
      keywords: ['devis', 'quote', 'quotation', 'estimation', 'proposition commerciale',
        'offre de prix', 'proposition de prix', 'proforma', 'pro forma', 'pro-forma',
        'sous réserve d\'acceptation', 'valable jusqu\'au', 'validité'],
      filenameHints: ['devis', 'quote', 'proforma', 'proposition'],
      excludeIf: [],
      score: 0
    },
    avoir: {
      keywords: ['avoir', 'credit note', 'note de crédit', 'remboursement',
        'avoir n°', 'avoir no', 'av-', 'annulation de facture'],
      filenameHints: ['avoir', 'credit', 'av_'],
      excludeIf: [],
      score: 0
    },
    relance: {
      keywords: ['relance', 'rappel de paiement', 'impayé', 'impaye', 'retard de paiement',
        'échéance dépassée', 'echeance depassee', 'solde impayé', 'en attente de règlement',
        'nous n\'avons pas reçu', 'restons en attente', 'merci de régulariser',
        '2ème relance', '3ème relance', 'dernière relance', 'relance n°'],
      filenameHints: ['relance', 'rappel'],
      excludeIf: [],
      score: 0
    },
    mise_en_demeure: {
      keywords: ['mise en demeure', 'sommation', 'injonction de payer',
        'recouvrement', 'huissier', 'contentieux', 'procédure judiciaire'],
      filenameHints: ['mise_en_demeure', 'sommation', 'injonction'],
      excludeIf: [],
      score: 0
    },
    bon_commande: {
      keywords: ['bon de commande', 'order confirmation', 'confirmation de commande',
        'commande n°', 'commande no', 'bc-', 'votre commande', 'accusé de réception'],
      filenameHints: ['bon_commande', 'bc_', 'order'],
      excludeIf: [],
      score: 0
    },
    bon_livraison: {
      keywords: ['bon de livraison', 'bordereau de livraison', 'bl-', 'livraison effectuée',
        'colis livré', 'expédition', 'suivi colis', 'tracking'],
      filenameHints: ['bon_livraison', 'bl_', 'delivery'],
      excludeIf: [],
      score: 0
    },
    releve: {
      keywords: ['relevé de compte', 'releve de compte', 'relevé bancaire',
        'relevé mensuel', 'extrait de compte', 'situation de compte'],
      filenameHints: ['releve', 'statement'],
      excludeIf: [],
      score: 0
    }
  };

  for (const [typeName, config] of Object.entries(types)) {
    // Keywords dans sujet + body
    for (const kw of config.keywords) {
      if (sub.includes(kw)) config.score += 30; // sujet = fort signal
      else if (bod.includes(kw)) config.score += 15; // body = signal moyen
    }
    // Noms de fichiers
    for (const hint of config.filenameHints) {
      if (filenames.includes(hint)) config.score += 25;
    }
    // Exclusions (ex: proforma n'est PAS une facture)
    for (const exc of config.excludeIf) {
      if (all.includes(exc)) config.score -= 50;
    }
  }

  // Trouver le meilleur type
  let bestType = 'inconnu';
  let bestScore = 0;
  for (const [typeName, config] of Object.entries(types)) {
    if (config.score > bestScore) {
      bestScore = config.score;
      bestType = typeName;
    }
  }

  // Extraction montant (regex)
  const montant = extractMontant(all);

  return {
    type: bestScore >= 15 ? bestType : 'inconnu',
    confidence: Math.min(bestScore / 60, 1),
    montant,
    all_scores: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, v.score]).filter(([k, v]) => v > 0))
  };
}

// =============================================
// 7. DÉTECTEUR "ATTEND UNE RÉPONSE"
// Repère les mails qui posent une question,
// demandent un document, ou attendent une action
// =============================================

const RESPONSE_SIGNALS = {
  // Questions directes (poids fort)
  questions: [
    /\?\s*$/m,                            // finit par ?
    /pouvez[- ]vous/i,                    // pouvez-vous...
    /pourriez[- ]vous/i,                  // pourriez-vous...
    /serait[- ]il possible/i,
    /merci de (nous )?(transmettre|envoyer|confirmer|indiquer|préciser|fournir|communiquer)/i,
    /nous (aurions|avons) besoin/i,
    /il (nous |me )?(manque|faudrait)/i,
    /avez[- ]vous/i,
    /êtes[- ]vous/i,
    /quand (pensez|pouvez|pourriez)/i,
    /quel(le)?s? (est|sont|sera)/i,
    /comment (souhaitez|voulez|préférez)/i,
  ],

  // Demandes de documents / actions
  demandes: [
    /merci de (nous )?(retourner|renvoyer|signer|valider|compléter)/i,
    /veuillez (nous )?(transmettre|envoyer|retourner|signer|confirmer)/i,
    /prière de/i,
    /dans l'attente de votre (réponse|retour|confirmation|accord|validation)/i,
    /en attente de (votre|vos|la) (réponse|retour|signature|validation|documents?)/i,
    /nous (restons|demeurons) (dans l'attente|à votre disposition)/i,
    /j'attends votre/i,
    /nous attendons/i,
    /à nous retourner/i,
    /document[s]? (à|manquant|requis|nécessaire)/i,
    /pièce[s]? (justificative|manquante|à fournir)/i,
  ],

  // Urgence de réponse
  urgence: [
    /dès que possible/i,
    /dans les (meilleurs|plus brefs) délais/i,
    /sous \d+ jours/i,
    /avant le \d/i,
    /date limite/i,
    /délai (de réponse|imparti)/i,
    /urgent/i,
    /asap/i,
  ],

  // Relances (la personne a DÉJÀ demandé avant)
  relance: [
    /sans (réponse|retour|nouvelle) de votre part/i,
    /nous vous (avions|avons) (contacté|écrit|sollicité)/i,
    /suite à (notre|mon) (précédent|dernier|premier) (mail|courrier|message)/i,
    /je me permets de revenir/i,
    /relance/i,
    /rappel/i,
    /2[èe]me|3[èe]me|second|troisième/i,
    /n'ayant pas (reçu|eu|obtenu)/i,
  ]
};

function detectNeedsResponse(mail) {
  const subject = (mail.subject || '').toLowerCase();
  const body = (mail.text || mail.body_preview || '').substring(0, 2000);
  const sender = ((mail.from || '') + ' ' + (mail.fromName || '')).toLowerCase();
  const all = subject + '\n' + body;

  // EXCLUSIONS : ces mails ne demandent JAMAIS de réponse
  if (/noreply|no.reply|ne.pas.repondre|do.not.reply|mailer.daemon/.test(sender))
    return { needs_response: false, urgency: 'none', response_type: null, score: 0, signals: ['noreply'] };
  // Newsletters / promos / notifications automatiques
  if (/newsletter|bulletin|notification|alert|digest|summary|promo|offre|soldes|vistaprint|messagerie vocale/.test(subject))
    return { needs_response: false, urgency: 'none', response_type: null, score: 0, signals: ['auto_notif'] };
  // Mails sans vrai contenu (juste un lien ou une image)
  if (body.length < 30 && !/\?/.test(subject))
    return { needs_response: false, urgency: 'none', response_type: null, score: 0, signals: ['empty_body'] };

  let score = 0;
  let signals = [];

  // Questions
  for (const pattern of RESPONSE_SIGNALS.questions) {
    if (pattern.test(all)) {
      score += 20;
      signals.push('question');
      break; // 1 match suffit par catégorie
    }
  }

  // Demandes
  for (const pattern of RESPONSE_SIGNALS.demandes) {
    if (pattern.test(all)) {
      score += 25;
      signals.push('demande_action');
      break;
    }
  }

  // Urgence
  for (const pattern of RESPONSE_SIGNALS.urgence) {
    if (pattern.test(all)) {
      score += 15;
      signals.push('urgence');
      break;
    }
  }

  // Relance (très fort signal — la personne attend VRAIMENT)
  for (const pattern of RESPONSE_SIGNALS.relance) {
    if (pattern.test(all)) {
      score += 35;
      signals.push('relance');
      break;
    }
  }

  // Bonus : si c'est un comptable ou banquier qui pose la question = très important
  const from = ((mail.from || '') + ' ' + (mail.fromName || '')).toLowerCase();
  const isComptable = /comptable|expert-comptable|fiduciaire/.test(from);
  const isBanque = /banque|cic|bnp|credit.mutuel|societe.generale|caisse.epargne|lcl/.test(from);
  const isJuridique = /avocat|huissier|tribunal|greffe|ordre/.test(from);

  if ((isComptable || isBanque || isJuridique) && score > 0) {
    score += 20;
    signals.push(isComptable ? 'comptable' : isBanque ? 'banque' : 'juridique');
  }

  // Détecter le TYPE de réponse attendue
  let responseType = 'reponse_simple';
  if (/document|pièce|justificatif|attestation|relevé|bilan|déclaration/i.test(all)) {
    responseType = 'document_demande';
  } else if (/signer|signature|valider|validation|accord|confirmation/i.test(all)) {
    responseType = 'validation_demande';
  } else if (/paiement|règlement|virement|régulariser|régler/i.test(all)) {
    responseType = 'paiement_demande';
  } else if (/rdv|rendez-vous|disponibilit|créneau/i.test(all)) {
    responseType = 'rdv_demande';
  }

  return {
    needs_response: score >= 20,
    urgency: score >= 50 ? 'urgent' : score >= 30 ? 'important' : score >= 20 ? 'normal' : 'none',
    response_type: score >= 20 ? responseType : null,
    score,
    signals
  };
}

function extractMontant(text) {
  // Patterns de montants français
  const patterns = [
    /(?:total|montant|ttc|net [àa] payer|à régler)[^0-9]{0,20}(\d[\d\s]*[.,]\d{2})\s*(?:€|eur)/i,
    /(\d[\d\s]*[.,]\d{2})\s*(?:€|eur)/g,
    /(?:€|eur)\s*(\d[\d\s]*[.,]\d{2})/g,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1] || match[0];
      const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
      const value = parseFloat(cleaned);
      if (value > 0 && value < 1000000) return value;
    }
  }
  return null;
}

function isPdf(att) {
  return String(att?.contentType || '').includes('pdf') || String(att?.filename || '').endsWith('.pdf');
}

// =============================================
// EXPORT
// =============================================

module.exports = {
  // Scoring complet
  spamScore,
  isNewsletter,
  classifyMailAdvanced,
  detectFinancialDocument,
  detectNeedsResponse,
  extractMontant,

  // Sender reputation
  recordSender,
  getSenderReputation,
  markSenderReplied,

  // Constantes (pour tests / enrichissement)
  TRUSTED_DOMAINS,
  SPAM_KEYWORDS,
  CATEGORY_RULES,
};
