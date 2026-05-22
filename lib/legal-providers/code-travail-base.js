// =============================================
// JADOMI — Base de connaissances Code du travail
// Articles fondamentaux pré-chargés pour le RAG
// Évite de requêter Légifrance pour les articles de base
// Mis à jour : 22 mai 2026
// =============================================

const CODE_TRAVAIL = {

  // === LICENCIEMENT ===
  'L.1232-1': {
    article: 'L.1232-1',
    titre: 'Motivation du licenciement',
    texte: 'Tout licenciement pour motif personnel est motivé dans les conditions définies par le présent chapitre. Il est justifié par une cause réelle et sérieuse.',
    theme: 'licenciement'
  },
  'L.1234-1': {
    article: 'L.1234-1',
    titre: 'Préavis de licenciement',
    texte: 'Lorsque le licenciement n\'est pas motivé par une faute grave, le salarié a droit : 1° S\'il justifie chez le même employeur d\'une ancienneté de services continus d\'au moins six mois, à un préavis d\'un mois ; 2° S\'il justifie chez le même employeur d\'une ancienneté de services continus d\'au moins deux ans, à un préavis de deux mois. Toutefois, les dispositions des 1° et 2° ne sont applicables que si la loi, la convention ou l\'accord collectif de travail, le contrat de travail ou les usages ne prévoient pas un préavis ou une condition d\'ancienneté de services plus favorable pour le salarié.',
    theme: 'preavis'
  },
  'L.1234-5': {
    article: 'L.1234-5',
    titre: 'Indemnité compensatrice de préavis',
    texte: 'Lorsque le salarié n\'exécute pas le préavis, il a droit, sauf s\'il a commis une faute grave, à une indemnité compensatrice. L\'inexécution du préavis, notamment en cas de dispense par l\'employeur, n\'entraîne aucune diminution des salaires et avantages que le salarié aurait perçus s\'il avait accompli son travail jusqu\'à l\'expiration du préavis, indemnité de congés payés comprise.',
    theme: 'preavis'
  },
  'L.1234-9': {
    article: 'L.1234-9',
    titre: 'Indemnité de licenciement — conditions',
    texte: 'Le salarié titulaire d\'un contrat de travail à durée indéterminée, licencié alors qu\'il compte 8 mois d\'ancienneté ininterrompus au service du même employeur, a droit, sauf en cas de faute grave, à une indemnité de licenciement. Les modalités de calcul de cette indemnité sont fonction de la rémunération brute dont le salarié bénéficiait antérieurement à la rupture du contrat de travail. Ce taux et ces modalités sont déterminés par voie réglementaire.',
    theme: 'indemnite_licenciement'
  },
  'R.1234-2': {
    article: 'R.1234-2',
    titre: 'Calcul de l\'indemnité légale de licenciement',
    texte: 'L\'indemnité de licenciement ne peut être inférieure aux montants suivants : 1° Un quart de mois de salaire par année d\'ancienneté pour les années jusqu\'à dix ans ; 2° Un tiers de mois de salaire par année d\'ancienneté pour les années à partir de dix ans.',
    theme: 'indemnite_licenciement'
  },
  'R.1234-4': {
    article: 'R.1234-4',
    titre: 'Salaire de référence',
    texte: 'Le salaire à prendre en considération pour le calcul de l\'indemnité de licenciement est, selon la formule la plus avantageuse pour le salarié : 1° Soit la moyenne mensuelle des douze derniers mois précédant le licenciement, ou lorsque la durée de service du salarié est inférieure à douze mois, la moyenne mensuelle de la rémunération de l\'ensemble des mois précédant le licenciement ; 2° Soit le tiers des trois derniers mois. Dans ce cas, toute prime ou gratification de caractère annuel ou exceptionnel, versée au salarié pendant cette période, n\'est prise en compte que dans la limite d\'un montant calculé à due proportion.',
    theme: 'salaire_reference'
  },

  // === BARÈME MACRON ===
  'L.1235-3': {
    article: 'L.1235-3',
    titre: 'Barème d\'indemnisation — licenciement sans cause réelle et sérieuse',
    texte: 'Si le licenciement d\'un salarié survient pour une cause qui n\'est pas réelle et sérieuse, le juge octroie au salarié une indemnité à la charge de l\'employeur, dont le montant est compris entre les montants minimaux et maximaux fixés dans le tableau ci-dessous (en mois de salaire brut). Le barème fixe un plancher de 1 mois (1 an d\'ancienneté) à 3 mois (11+ ans) et un plafond de 1 mois (0 an) à 20 mois (30+ ans).',
    theme: 'bareme_macron'
  },
  'L.1235-3-1': {
    article: 'L.1235-3-1',
    titre: 'Licenciement nul — hors barème',
    texte: 'L\'article L.1235-3 n\'est pas applicable lorsque le juge constate que le licenciement est entaché d\'une des nullités prévues au deuxième alinéa du présent article. Dans ce cas, lorsque le salarié ne demande pas la poursuite de l\'exécution de son contrat de travail ou que sa réintégration est impossible, le juge lui octroie une indemnité, à la charge de l\'employeur, qui ne peut être inférieure aux salaires des six derniers mois. Les nullités visées sont : discrimination (art. L.1132-4), harcèlement moral ou sexuel, violation d\'une liberté fondamentale, salarié protégé, maternité/paternité.',
    theme: 'bareme_macron'
  },

  // === INAPTITUDE ===
  'L.1226-14': {
    article: 'L.1226-14',
    titre: 'Inaptitude d\'origine professionnelle — indemnité spéciale',
    texte: 'La rupture du contrat de travail dans les cas prévus au deuxième alinéa de l\'article L.1226-12 ouvre droit, pour le salarié, à une indemnité compensatrice d\'un montant égal à celui de l\'indemnité compensatrice de préavis prévue à l\'article L.1234-5 ainsi qu\'à une indemnité spéciale de licenciement qui, sauf dispositions conventionnelles plus favorables, est égale au double de l\'indemnité prévue par l\'article L.1234-9.',
    theme: 'inaptitude'
  },

  // === HARCÈLEMENT ===
  'L.1152-1': {
    article: 'L.1152-1',
    titre: 'Définition du harcèlement moral',
    texte: 'Aucun salarié ne doit subir les agissements répétés de harcèlement moral qui ont pour objet ou pour effet une dégradation de ses conditions de travail susceptible de porter atteinte à ses droits et à sa dignité, d\'altérer sa santé physique ou mentale ou de compromettre son avenir professionnel.',
    theme: 'harcelement'
  },
  'L.1153-1': {
    article: 'L.1153-1',
    titre: 'Définition du harcèlement sexuel',
    texte: 'Aucun salarié ne doit subir des faits : 1° Soit de harcèlement sexuel, constitué par des propos ou comportements à connotation sexuelle ou sexiste répétés qui soit portent atteinte à sa dignité en raison de leur caractère dégradant ou humiliant, soit créent à son encontre une situation intimidante, hostile ou offensante ; 2° Soit assimilés au harcèlement sexuel, consistant en toute forme de pression grave, même non répétée, exercée dans le but réel ou apparent d\'obtenir un acte de nature sexuelle.',
    theme: 'harcelement'
  },

  // === DISCRIMINATION ===
  'L.1132-1': {
    article: 'L.1132-1',
    titre: 'Principe de non-discrimination — 25 critères',
    texte: 'Aucune personne ne peut être écartée d\'une procédure de recrutement ou de nomination ou de l\'accès à un stage ou à une période de formation en entreprise, aucun salarié ne peut être sanctionné, licencié ou faire l\'objet d\'une mesure discriminatoire, directe ou indirecte, notamment en matière de rémunération, de mesures d\'intéressement ou de distribution d\'actions, de formation, de reclassement, d\'affectation, de qualification, de classification, de promotion professionnelle, d\'horaires de travail, d\'évaluation de la performance, de mutation ou de renouvellement de contrat en raison de son origine, de son sexe, de ses mœurs, de son orientation sexuelle, de son identité de genre, de son âge, de sa situation de famille ou de sa grossesse, de ses caractéristiques génétiques, de la particulière vulnérabilité résultant de sa situation économique, apparente ou connue de son auteur, de son appartenance ou de sa non-appartenance, vraie ou supposée, à une ethnie, une nation ou une prétendue race, de ses opinions politiques, de ses activités syndicales ou mutualistes, de son exercice d\'un mandat électif, de ses convictions religieuses, de son apparence physique, de son nom de famille, de son lieu de résidence ou de sa domiciliation bancaire, ou en raison de son état de santé, de sa perte d\'autonomie ou de son handicap, de sa capacité à s\'exprimer dans une langue autre que le français, de sa qualité de lanceur d\'alerte, de facilitateur ou de personne en lien avec un lanceur d\'alerte.',
    theme: 'discrimination'
  },

  // === RUPTURE CONVENTIONNELLE ===
  'L.1237-11': {
    article: 'L.1237-11',
    titre: 'Rupture conventionnelle — principe',
    texte: 'L\'employeur et le salarié peuvent convenir en commun des conditions de la rupture du contrat de travail qui les lie. La rupture conventionnelle, exclusive du licenciement ou de la démission, ne peut être imposée par l\'une ou l\'autre des parties.',
    theme: 'rupture_conventionnelle'
  },
  'L.1237-13': {
    article: 'L.1237-13',
    titre: 'Rupture conventionnelle — indemnité et rétractation',
    texte: 'La convention de rupture définit les conditions de celle-ci, notamment le montant de l\'indemnité spécifique de rupture conventionnelle qui ne peut pas être inférieur à celui de l\'indemnité prévue à l\'article L.1234-9. Elle fixe la date de rupture du contrat de travail, qui ne peut intervenir avant le lendemain du jour de l\'homologation. À compter de la date de sa signature par les deux parties, chacune d\'entre elles dispose d\'un délai de quinze jours calendaires pour exercer son droit de rétractation.',
    theme: 'rupture_conventionnelle'
  },

  // === CDD ===
  'L.1243-8': {
    article: 'L.1243-8',
    titre: 'Indemnité de fin de contrat (précarité CDD)',
    texte: 'Lorsque, à l\'issue d\'un contrat de travail à durée déterminée, les relations contractuelles de travail ne se poursuivent pas par un contrat à durée indéterminée, le salarié a droit, à titre de complément de salaire, à une indemnité de fin de contrat destinée à compenser la précarité de sa situation. Cette indemnité est égale à 10 % de la rémunération totale brute versée au salarié.',
    theme: 'cdd'
  },

  // === TRAVAIL DISSIMULÉ ===
  'L.8223-1': {
    article: 'L.8223-1',
    titre: 'Indemnité forfaitaire travail dissimulé',
    texte: 'En cas de rupture de la relation de travail, le salarié auquel un employeur a eu recours dans les conditions de l\'article L.8221-3 ou en commettant les faits prévus à l\'article L.8221-5 a droit à une indemnité forfaitaire égale à six mois de salaire.',
    theme: 'travail_dissimule'
  },

  // === HEURES SUPPLÉMENTAIRES ===
  'L.3121-28': {
    article: 'L.3121-28',
    titre: 'Majoration des heures supplémentaires',
    texte: 'Les heures supplémentaires accomplies au-delà de la durée légale hebdomadaire fixée par l\'article L.3121-27 donnent lieu à une majoration de salaire de 25 % pour chacune des huit premières heures supplémentaires. Les heures suivantes donnent lieu à une majoration de 50 %.',
    theme: 'heures_supplementaires'
  },

  // === OBLIGATION DE SÉCURITÉ ===
  'L.4121-1': {
    article: 'L.4121-1',
    titre: 'Obligation de sécurité de l\'employeur',
    texte: 'L\'employeur prend les mesures nécessaires pour assurer la sécurité et protéger la santé physique et mentale des travailleurs. Ces mesures comprennent : 1° Des actions de prévention des risques professionnels ; 2° Des actions d\'information et de formation ; 3° La mise en place d\'une organisation et de moyens adaptés.',
    theme: 'obligation_securite'
  },

  // === FISCAL ===
  '80_duodecies': {
    article: 'Art. 80 duodecies CGI',
    titre: 'Régime fiscal des indemnités de rupture',
    texte: 'Toute indemnité versée à l\'occasion de la rupture du contrat de travail constitue une rémunération imposable. Toutefois, ne constituent pas une rémunération imposable : 1° Les indemnités mentionnées aux articles L.1234-9, L.1243-8 et L.1237-13 du code du travail. Pour la fraction des indemnités qui excède le montant prévu par la loi ou la convention ou accord collectif, l\'exonération est limitée au plus élevé des trois montants suivants : a) Le montant de l\'indemnité de licenciement prévue par la convention collective ou la loi ; b) Deux fois le montant de la rémunération annuelle brute perçue par le salarié au cours de l\'année civile précédant la rupture ; c) 50 % du montant de l\'indemnité si ce montant est supérieur au montant mentionné au b. L\'ensemble ne peut excéder six fois le plafond de la sécurité sociale.',
    theme: 'fiscal'
  }
};

// ================================================
// JURISPRUDENCE FONDAMENTALE pré-chargée
// ================================================
const JURISPRUDENCE_BASE = [
  {
    reference: 'Cass. soc. 25 novembre 2020, n° 18-13.769 (Assemblée plénière)',
    sujet: 'Barème Macron — compatibilité avec art. 10 Convention OIT n° 158',
    principe: 'Le barème prévu par l\'article L.1235-3 est compatible avec les stipulations de l\'article 10 de la Convention n° 158 de l\'OIT. Le juge ne peut écarter le barème au cas par cas.',
    theme: 'bareme_macron'
  },
  {
    reference: 'Cass. soc. 18 mars 2020, n° 18-10.919',
    sujet: 'Heures supplémentaires — charge de la preuve partagée',
    principe: 'En cas de litige relatif à l\'existence ou au nombre d\'heures de travail accomplies, il appartient au salarié de présenter des éléments suffisamment précis quant aux heures non rémunérées pour permettre à l\'employeur d\'y répondre. Le juge forme sa conviction au vu de l\'ensemble des éléments.',
    theme: 'heures_supplementaires'
  },
  {
    reference: 'Cons. const., QPC 2 mars 2016, n° 2015-523',
    sujet: 'Faute lourde — congés payés dus',
    principe: 'La privation de l\'indemnité compensatrice de congés payés en cas de faute lourde est contraire au droit au repos. Le salarié licencié pour faute lourde conserve le droit à l\'indemnité compensatrice de congés payés.',
    theme: 'faute_lourde'
  },
  {
    reference: 'Cass. soc. 29 juin 2022, n° 20-22.220',
    sujet: 'Harcèlement moral — obligation d\'enquête',
    principe: 'L\'employeur qui n\'a pas diligenté d\'enquête interne après avoir été alerté de faits de harcèlement moral manque à son obligation de sécurité, et ce même si le harcèlement n\'est finalement pas caractérisé.',
    theme: 'harcelement'
  },
  {
    reference: 'Cass. soc. 22 novembre 2017, n° 16-13.883',
    sujet: 'Inaptitude professionnelle — doublement indemnité',
    principe: 'L\'indemnité spéciale de licenciement prévue par l\'article L.1226-14 est égale au double de l\'indemnité LÉGALE. Lorsque l\'indemnité conventionnelle est supérieure au double de la légale, c\'est la conventionnelle (non doublée) qui s\'applique.',
    theme: 'inaptitude'
  },
  {
    reference: 'Cass. soc. 30 janvier 2020, n° 18-10.330',
    sujet: 'Forfait jours — nullité si contrôle insuffisant',
    principe: 'Est nulle la convention de forfait en jours conclue en application d\'un accord collectif qui ne prévoit pas de suivi effectif et régulier de la charge de travail du salarié.',
    theme: 'forfait_jours'
  }
];

// ================================================
// FONCTIONS D'ACCÈS
// ================================================

function getArticle(ref) {
  return CODE_TRAVAIL[ref] || null;
}

function getArticlesByTheme(theme) {
  return Object.values(CODE_TRAVAIL).filter(a => a.theme === theme);
}

function getJurisprudenceByTheme(theme) {
  return JURISPRUDENCE_BASE.filter(j => j.theme === theme);
}

function getAllThemes() {
  const themes = new Set();
  Object.values(CODE_TRAVAIL).forEach(a => themes.add(a.theme));
  return [...themes];
}

/**
 * Construit un bloc de connaissances pour enrichir le prompt IA
 * selon le thème de la question
 */
function buildKnowledgeBlock(themes) {
  let block = '\n\n--- BASE DE CONNAISSANCES DROIT DU TRAVAIL (articles pré-chargés) ---\n';

  for (const theme of themes) {
    const articles = getArticlesByTheme(theme);
    const jurisprudences = getJurisprudenceByTheme(theme);

    if (articles.length) {
      block += '\n[ARTICLES — ' + theme.toUpperCase() + ']\n';
      articles.forEach(a => {
        block += 'Art. ' + a.article + ' — ' + a.titre + '\n' + a.texte + '\n\n';
      });
    }

    if (jurisprudences.length) {
      block += '[JURISPRUDENCE — ' + theme.toUpperCase() + ']\n';
      jurisprudences.forEach(j => {
        block += j.reference + '\n' + j.principe + '\n\n';
      });
    }
  }

  block += '--- FIN BASE DE CONNAISSANCES ---\n';
  return block;
}

/**
 * Détecte les thèmes dans une question
 */
function detectThemes(question) {
  const q = question.toLowerCase();
  const detected = [];

  const patterns = {
    licenciement: /licenci|licencie/,
    preavis: /pr[eé]avis/,
    indemnite_licenciement: /indemnit[eé].*licenci|indemnit[eé].*l[eé]gale/,
    bareme_macron: /bar[eè]me|macron|sans cause|scr/,
    inaptitude: /inapti|at.?mp|accident.*travail|maladie.*pro/,
    harcelement: /harc[eè]le|harcel/,
    discrimination: /discrimin/,
    rupture_conventionnelle: /rupture.*conv|rc\b/,
    cdd: /cdd|dur[eé]e.*d[eé]termin[eé]|pr[eé]carit/,
    travail_dissimule: /dissimul[eé]|travail.*noir/,
    heures_supplementaires: /heure.*sup|hs\b|forfait.*jour/,
    obligation_securite: /obligation.*s[eé]curit|duerp|risque.*pro/,
    fiscal: /fiscal|imp[oô]t|csg|exon[eé]r|charge.*social/,
    faute_lourde: /faute.*lourde/,
    forfait_jours: /forfait.*jour/
  };

  for (const [theme, pattern] of Object.entries(patterns)) {
    if (pattern.test(q)) detected.push(theme);
  }

  return detected.length ? detected : ['licenciement']; // défaut
}

module.exports = {
  CODE_TRAVAIL,
  JURISPRUDENCE_BASE,
  getArticle,
  getArticlesByTheme,
  getJurisprudenceByTheme,
  getAllThemes,
  buildKnowledgeBlock,
  detectThemes
};
