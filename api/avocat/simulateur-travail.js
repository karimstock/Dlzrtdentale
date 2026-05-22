// =============================================
// JADOMI AVOCAT — Simulateur Droit du Travail
// Version PROFESSIONNELLE — Niveau avocat spécialisé
// CDI, CDD, Intérim, Apprentissage
// 12 motifs de rupture, 10 CCN, fiscalité complète
// Spécialité épouse du fondateur = PRIORITAIRE
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

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
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// ================================================
// CONSTANTES LÉGALES 2026
// ================================================
const PASS_2026 = 47100;           // Plafond Annuel Sécurité Sociale
const SMIC_MENSUEL_BRUT = 1801.80; // SMIC mensuel brut 2026
const CSG_TAUX = 0.092;            // 9,2 %
const CSG_DEDUCTIBLE = 0.068;      // 6,8 % déductible
const CRDS_TAUX = 0.005;           // 0,5 %
const TVA_AVOCAT = 0.20;
const CONTRIBUTION_RUPTURE_CONV = 0.30; // 30 % employeur depuis 01/09/2023

// ================================================
// TYPES DE CONTRAT
// ================================================
const TYPES_CONTRAT = {
  cdi: {
    code: 'cdi',
    libelle: 'CDI — Contrat à durée indéterminée',
    references: ['Art. L.1231-1 et s. Code du travail']
  },
  cdd: {
    code: 'cdd',
    libelle: 'CDD — Contrat à durée déterminée',
    indemnite_precarite_taux: 0.10,       // 10 % par défaut
    indemnite_precarite_taux_usage: 0.06, // 6 % si accord de branche
    references: ['Art. L.1243-8 Code du travail (indemnité de précarité)', 'Art. L.1243-4 (rupture anticipée = DI restant dû)']
  },
  interim: {
    code: 'interim',
    libelle: 'Intérim — Contrat de travail temporaire',
    ifm_taux: 0.10,  // Indemnité de fin de mission 10 %
    iccp_taux: 0.10,  // ICCP = 10 % de (brut + IFM)
    references: ['Art. L.1251-32 Code du travail (IFM)', 'Art. L.1251-19 (ICCP)']
  },
  apprentissage: {
    code: 'apprentissage',
    libelle: 'Apprentissage — Contrat d\'apprentissage',
    periode_libre_jours: 45,
    motifs_rupture_apres_45j: ['faute_grave', 'inaptitude', 'accord_mutuel', 'demission_apprenti'],
    references: ['Art. L.6222-18 Code du travail']
  }
};

// ================================================
// MOTIFS DE RUPTURE — 12 motifs avec conséquences exactes
// ================================================
const MOTIFS_RUPTURE = {
  faute_simple: {
    code: 'faute_simple',
    libelle: 'Licenciement pour faute simple',
    indemnite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    references: ['Art. L.1232-1 Code du travail', 'Art. L.1234-1 (préavis)', 'Art. L.1234-9 (indemnité)'],
    note: 'Faute constituant une cause réelle et sérieuse. Le salarié perçoit l\'intégralité de ses droits.'
  },
  faute_grave: {
    code: 'faute_grave',
    libelle: 'Licenciement pour faute grave',
    indemnite: false,
    preavis: false,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    references: ['Art. L.1234-1 Code du travail', 'Art. L.1234-5 (pas de préavis)', 'Art. L.1234-9 (pas d\'indemnité)'],
    note: 'Faute rendant impossible le maintien du salarié dans l\'entreprise, même pendant le préavis.'
  },
  faute_lourde: {
    code: 'faute_lourde',
    libelle: 'Licenciement pour faute lourde',
    indemnite: false,
    preavis: false,
    conges_payes: true,  // QPC Conseil constitutionnel 2 mars 2016 n° 2015-523
    bareme_macron: false,
    chomage: true,
    references: [
      'Art. L.1234-1 Code du travail',
      'Conseil constitutionnel, QPC 2 mars 2016 n° 2015-523 (CP dus même en faute lourde)',
      'Cass. soc. 20 mars 2019, n° 17-22.394'
    ],
    note: 'Faute commise avec intention de nuire à l\'employeur. Depuis la QPC de 2016, les congés payés restent dus.'
  },
  insuffisance: {
    code: 'insuffisance',
    libelle: 'Licenciement pour insuffisance professionnelle',
    indemnite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    references: ['Art. L.1232-1 Code du travail', 'Cass. soc. 17 février 2004, n° 01-44.543'],
    note: 'Ne constitue pas une faute. Le salarié conserve tous ses droits (indemnité, préavis, CP).'
  },
  inaptitude_pro: {
    code: 'inaptitude_pro',
    libelle: 'Licenciement pour inaptitude d\'origine professionnelle',
    indemnite: true,
    indemnite_doublee: true,  // Art. L.1226-14 : indemnité légale doublée
    preavis: false,           // Pas de préavis mais indemnité compensatrice versée
    indemnite_preavis: true,  // Indemnité compensatrice de préavis versée
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    references: [
      'Art. L.1226-14 Code du travail (indemnité spéciale de licenciement = 2× légale)',
      'Art. L.1226-14 al. 1 (indemnité compensatrice de préavis)',
      'Art. L.1226-12 (obligation de reclassement)'
    ],
    note: 'Indemnité spéciale = double de l\'indemnité LÉGALE (art. L.1226-14). Si la conventionnelle simple est supérieure à la légale doublée, c\'est la conventionnelle qui s\'applique.'
  },
  inaptitude_non_pro: {
    code: 'inaptitude_non_pro',
    libelle: 'Licenciement pour inaptitude d\'origine non professionnelle',
    indemnite: true,
    indemnite_doublee: false,
    preavis: false,           // Pas de préavis, pas d'indemnité compensatrice
    indemnite_preavis: false,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    references: [
      'Art. L.1226-4 Code du travail',
      'Art. L.1226-2 (obligation de reclassement)',
      'Cass. soc. 29 juin 2011, n° 09-71.459'
    ],
    note: 'Indemnité de licenciement simple. Pas de préavis ni d\'indemnité compensatrice de préavis.'
  },
  eco: {
    code: 'eco',
    libelle: 'Licenciement économique individuel',
    indemnite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    csp: true,  // Contrat de sécurisation professionnelle
    references: [
      'Art. L.1233-3 Code du travail (motif économique)',
      'Art. L.1233-65 et s. (CSP)',
      'Art. L.1234-9 (indemnité)'
    ],
    note: 'Ouverture du CSP (Contrat de Sécurisation Professionnelle). L\'adhésion au CSP vaut rupture du contrat.'
  },
  scr: {
    code: 'scr',
    libelle: 'Licenciement sans cause réelle et sérieuse',
    indemnite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: true,
    chomage: true,
    references: [
      'Art. L.1235-3 Code du travail (barème Macron)',
      'Ordonnances n° 2017-1387 du 22 septembre 2017',
      'Art. L.1235-5 (TPE < 11 salariés)'
    ],
    note: 'Le juge fixe les dommages-intérêts dans le cadre du barème Macron (plancher/plafond en mois de salaire).'
  },
  rupture_conv: {
    code: 'rupture_conv',
    libelle: 'Rupture conventionnelle individuelle',
    indemnite: true,
    indemnite_minimum_legale: true,
    preavis: false,
    conges_payes: true,
    bareme_macron: false,
    chomage: true,
    contribution_employeur: true,  // 30 % depuis 01/09/2023
    references: [
      'Art. L.1237-11 à L.1237-16 Code du travail',
      'Art. L.1237-13 (indemnité ≥ légale)',
      'Art. L.137-12 CSS (contribution employeur 30 % depuis 01/09/2023)'
    ],
    note: 'L\'indemnité ne peut être inférieure à l\'indemnité légale de licenciement. Contribution employeur de 30 % sur la part exonérée depuis le 1er septembre 2023.'
  },
  prise_acte: {
    code: 'prise_acte',
    libelle: 'Prise d\'acte de la rupture (si SCR retenu)',
    indemnite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: true,
    chomage: true,
    references: [
      'Art. L.1451-1 Code du travail (saisine directe bureau de jugement)',
      'Cass. soc. 25 juin 2003, n° 01-42.335 (prise d\'acte)',
      'Art. L.1235-3 (barème si SCR retenu)'
    ],
    note: 'Si le juge retient que la prise d\'acte est justifiée, elle produit les effets d\'un licenciement sans cause réelle et sérieuse.'
  },
  demission: {
    code: 'demission',
    libelle: 'Démission',
    indemnite: false,
    preavis: true,
    preavis_du_par_salarie: true,
    conges_payes: true,
    bareme_macron: false,
    chomage: false,
    references: [
      'Art. L.1237-1 Code du travail',
      'Art. L.1234-1 (préavis dû par le salarié)'
    ],
    note: 'Le salarié doit effectuer son préavis. Pas d\'indemnité de licenciement. Pas d\'allocation chômage sauf cas exceptionnels (démission légitime).'
  },
  depart_retraite: {
    code: 'depart_retraite',
    libelle: 'Départ volontaire à la retraite',
    indemnite: false,
    indemnite_retraite: true,
    preavis: true,
    conges_payes: true,
    bareme_macron: false,
    chomage: false,
    references: [
      'Art. L.1237-9 Code du travail (indemnité de départ en retraite)',
      'Art. D.1237-1 (montant indemnité retraite)'
    ],
    note: 'Indemnité de départ en retraite (≠ indemnité de licenciement). Régime fiscal spécifique.'
  }
};

// ================================================
// STATUTS PROFESSIONNELS
// ================================================
const STATUTS = {
  ouvrier: { code: 'ouvrier', libelle: 'Ouvrier' },
  employe: { code: 'employe', libelle: 'Employé' },
  technicien: { code: 'technicien', libelle: 'Technicien' },
  agent_maitrise: { code: 'agent_maitrise', libelle: 'Agent de maîtrise' },
  cadre: { code: 'cadre', libelle: 'Cadre' },
  cadre_dirigeant: { code: 'cadre_dirigeant', libelle: 'Cadre dirigeant' }
};

// ================================================
// 10 CONVENTIONS COLLECTIVES — Formules exactes
// ================================================
const CONVENTIONS_COLLECTIVES = {
  1486: {
    idcc: 1486,
    nom: 'Convention collective nationale des bureaux d\'études techniques, cabinets d\'ingénieurs-conseils et sociétés de conseils (Syntec)',
    brochure: 3018,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0; // 8 mois minimum
      if (['cadre', 'cadre_dirigeant'].includes(statut)) {
        // Cadres : 1/3 mois par année, plafond 12 mois
        return round2(Math.min((1 / 3) * salaireRef * anciennete, 12 * salaireRef));
      }
      // ETAM : 1/4 mois par année
      return round2((1 / 4) * salaireRef * anciennete);
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      return 1;
    },
    references: ['CCN Syntec, art. 19 (ETAM)', 'CCN Syntec, art. 15 (Cadres — IC)']
  },

  3248: {
    idcc: 3248,
    nom: 'Convention collective nationale de la métallurgie',
    brochure: 3389,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0;
      // Régime général : identique au légal
      let indLegale;
      if (anciennete <= 10) {
        indLegale = (1 / 4) * salaireRef * anciennete;
      } else {
        indLegale = (1 / 4) * salaireRef * 10 + (1 / 3) * salaireRef * (anciennete - 10);
      }
      // Ancien régime cadres (dispositions transitoires)
      if (['cadre', 'cadre_dirigeant'].includes(statut)) {
        let indTransitoire;
        if (anciennete <= 7) {
          indTransitoire = (1 / 5) * salaireRef * anciennete;
        } else {
          indTransitoire = (1 / 5) * salaireRef * 7 + (3 / 5) * salaireRef * (anciennete - 7);
        }
        return round2(Math.max(indLegale, indTransitoire));
      }
      return round2(indLegale);
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1;
      return 0;
    },
    references: ['CCN Métallurgie 2024, art. 74 et s.', 'Dispositions transitoires anciens cadres']
  },

  573: {
    idcc: 573,
    nom: 'Convention collective nationale du commerce de gros',
    brochure: 3044,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0;
      if (['cadre', 'cadre_dirigeant', 'agent_maitrise'].includes(statut)) {
        // Cadres et AM : 3/10 jusqu'à 10 ans + 4/10 au-delà
        if (anciennete <= 10) {
          return round2((3 / 10) * salaireRef * anciennete);
        }
        return round2((3 / 10) * salaireRef * 10 + (4 / 10) * salaireRef * (anciennete - 10));
      }
      // Employés : 1/5 jusqu'à 10 ans + 3/10 au-delà
      if (anciennete <= 10) {
        return round2((1 / 5) * salaireRef * anciennete);
      }
      return round2((1 / 5) * salaireRef * 10 + (3 / 10) * salaireRef * (anciennete - 10));
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1;
      return 0;
    },
    references: ['CCN Commerce de gros, art. 14 (employés)', 'CCN Commerce de gros, art. 18 (cadres)']
  },

  1979: {
    idcc: 1979,
    nom: 'Convention collective nationale des hôtels, cafés, restaurants (HCR)',
    brochure: 3292,
    calcul_indemnite(anciennete, salaireRef, _statut) {
      if (anciennete < 0.67) return 0;
      // Identique au légal
      if (anciennete <= 10) {
        return round2((1 / 4) * salaireRef * anciennete);
      }
      return round2((1 / 4) * salaireRef * 10 + (1 / 3) * salaireRef * (anciennete - 10));
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1;
      return 0;
    },
    references: ['CCN HCR, avenant n° 6 du 15 décembre 2009']
  },

  1597: {
    idcc: 1597,
    nom: 'Convention collective nationale du bâtiment — Ouvriers (≤ 10 salariés)',
    brochure: 3193,
    calcul_indemnite(anciennete, salaireRef, _statut) {
      if (anciennete < 0.67) return 0;
      let indemnite = 0;
      if (anciennete <= 5) {
        indemnite = (1 / 10) * salaireRef * anciennete;
      } else if (anciennete <= 15) {
        indemnite = (1 / 10) * salaireRef * 5 + (1.5 / 10) * salaireRef * (anciennete - 5);
      } else {
        indemnite = (1 / 10) * salaireRef * 5 + (1.5 / 10) * salaireRef * 10 + (2 / 10) * salaireRef * (anciennete - 15);
      }
      return round2(indemnite);
    },
    preavis(anciennete, _statut) {
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1; // 2 semaines → arrondi 1 mois dans le calcul
      return 0;
    },
    references: ['CCN BTP Ouvriers, art. 10.2 (indemnité de licenciement)']
  },

  1702: {
    idcc: 1702,
    nom: 'Convention collective nationale du bâtiment — ETAM',
    brochure: 3193,
    calcul_indemnite(anciennete, salaireRef, _statut) {
      if (anciennete < 0.67) return 0;
      if (anciennete <= 10) {
        return round2((2.5 / 10) * salaireRef * anciennete);
      }
      return round2((2.5 / 10) * salaireRef * 10 + (3.5 / 10) * salaireRef * (anciennete - 10));
    },
    preavis(anciennete, _statut) {
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1;
      return 0;
    },
    references: ['CCN BTP ETAM, art. 9.2 (indemnité de licenciement)']
  },

  2609: {
    idcc: 2609,
    nom: 'Convention collective nationale du bâtiment — Cadres',
    brochure: 3193,
    calcul_indemnite(anciennete, salaireRef, _statut) {
      if (anciennete < 0.67) return 0;
      if (anciennete <= 5) {
        return round2((3 / 10) * salaireRef * anciennete);
      }
      return round2((3 / 10) * salaireRef * 5 + (5 / 10) * salaireRef * (anciennete - 5));
    },
    preavis(_anciennete, _statut) {
      return 3; // 3 mois pour les cadres
    },
    references: ['CCN BTP Cadres, art. 7.3 (indemnité de licenciement)']
  },

  2120: {
    idcc: 2120,
    nom: 'Convention collective nationale de la banque',
    brochure: 3161,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0;
      if (['cadre', 'cadre_dirigeant'].includes(statut)) {
        // Cadres : 3/10 jusqu'à 10 + 4/10 au-delà
        if (anciennete <= 10) {
          return round2((3 / 10) * salaireRef * anciennete);
        }
        return round2((3 / 10) * salaireRef * 10 + (4 / 10) * salaireRef * (anciennete - 10));
      }
      // Techniciens : 1/4 jusqu'à 10 + 1/3 au-delà
      if (anciennete <= 10) {
        return round2((1 / 4) * salaireRef * anciennete);
      }
      return round2((1 / 4) * salaireRef * 10 + (1 / 3) * salaireRef * (anciennete - 10));
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      return 1;
    },
    references: ['CCN Banque, art. 29 (techniciens)', 'CCN Banque, art. 55 (cadres)']
  },

  1996: {
    idcc: 1996,
    nom: 'Convention collective nationale de la pharmacie d\'officine',
    brochure: 3052,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0;
      if (['cadre', 'cadre_dirigeant'].includes(statut)) {
        // Cadres : 3/10 jusqu'à 10 + 5/10 au-delà
        if (anciennete <= 10) {
          return round2((3 / 10) * salaireRef * anciennete);
        }
        return round2((3 / 10) * salaireRef * 10 + (5 / 10) * salaireRef * (anciennete - 10));
      }
      // Non-cadres : 3/10 jusqu'à 10 + 4/10 au-delà
      if (anciennete <= 10) {
        return round2((3 / 10) * salaireRef * anciennete);
      }
      return round2((3 / 10) * salaireRef * 10 + (4 / 10) * salaireRef * (anciennete - 10));
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      return 1;
    },
    references: ['CCN Pharmacie officine, art. 16 (non-cadres)', 'CCN Pharmacie officine, art. 20 (cadres)']
  },

  16: {
    idcc: 16,
    nom: 'Convention collective nationale des transports routiers et activités auxiliaires du transport',
    brochure: 3085,
    calcul_indemnite(anciennete, salaireRef, statut) {
      if (anciennete < 0.67) return 0;
      if (['cadre', 'cadre_dirigeant'].includes(statut)) {
        // Cadres : 3/10 jusqu'à 5 + 4/10 au-delà
        if (anciennete <= 5) {
          return round2((3 / 10) * salaireRef * anciennete);
        }
        return round2((3 / 10) * salaireRef * 5 + (4 / 10) * salaireRef * (anciennete - 5));
      }
      // Ouvriers : tranches progressives
      let indemnite = 0;
      if (anciennete <= 5) {
        indemnite = (1 / 10) * salaireRef * anciennete;
      } else if (anciennete <= 10) {
        indemnite = (1 / 10) * salaireRef * 5 + (1.5 / 10) * salaireRef * (anciennete - 5);
      } else if (anciennete <= 15) {
        indemnite = (1 / 10) * salaireRef * 5 + (1.5 / 10) * salaireRef * 5 + (2 / 10) * salaireRef * (anciennete - 10);
      } else {
        indemnite = (1 / 10) * salaireRef * 5 + (1.5 / 10) * salaireRef * 5 + (2 / 10) * salaireRef * 5 + (2.5 / 10) * salaireRef * (anciennete - 15);
      }
      return round2(indemnite);
    },
    preavis(anciennete, statut) {
      if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
      if (anciennete >= 2) return 2;
      if (anciennete >= 0.5) return 1;
      return 0;
    },
    references: ['CCN Transport routier, accord du 16 juin 1961 (ouvriers)', 'CCN Transport routier, annexe IV (cadres)']
  }
};

// ================================================
// BARÈME MACRON — Art. L.1235-3 (entreprises >= 11 salariés)
// ================================================
const BAREME_MACRON = [
  { annees: 0,  plancher: 0,   plafond: 1 },
  { annees: 1,  plancher: 1,   plafond: 2 },
  { annees: 2,  plancher: 3,   plafond: 3.5 },
  { annees: 3,  plancher: 3,   plafond: 4 },
  { annees: 4,  plancher: 3,   plafond: 5 },
  { annees: 5,  plancher: 3,   plafond: 6 },
  { annees: 6,  plancher: 3,   plafond: 7 },
  { annees: 7,  plancher: 3,   plafond: 8 },
  { annees: 8,  plancher: 3,   plafond: 8 },
  { annees: 9,  plancher: 3,   plafond: 9 },
  { annees: 10, plancher: 3,   plafond: 10 },
  { annees: 11, plancher: 3,   plafond: 10.5 },
  { annees: 12, plancher: 3,   plafond: 11 },
  { annees: 13, plancher: 3,   plafond: 11.5 },
  { annees: 14, plancher: 3,   plafond: 12 },
  { annees: 15, plancher: 3,   plafond: 13 },
  { annees: 16, plancher: 3,   plafond: 13.5 },
  { annees: 17, plancher: 3,   plafond: 14 },
  { annees: 18, plancher: 3,   plafond: 14.5 },
  { annees: 19, plancher: 3,   plafond: 15 },
  { annees: 20, plancher: 3,   plafond: 15.5 },
  { annees: 21, plancher: 3,   plafond: 16 },
  { annees: 22, plancher: 3,   plafond: 16.5 },
  { annees: 23, plancher: 3,   plafond: 17 },
  { annees: 24, plancher: 3,   plafond: 17.5 },
  { annees: 25, plancher: 3,   plafond: 18 },
  { annees: 26, plancher: 3,   plafond: 18.5 },
  { annees: 27, plancher: 3,   plafond: 19 },
  { annees: 28, plancher: 3,   plafond: 19.5 },
  { annees: 29, plancher: 3,   plafond: 20 },
  { annees: 30, plancher: 3,   plafond: 20 },
];

// Barème TPE (< 11 salariés) — plancher réduit art. L.1235-3 al. 2
const BAREME_TPE_PLANCHER = [
  { annees: 0, plancher: 0 },
  { annees: 1, plancher: 0.5 },
  { annees: 2, plancher: 0.5 },
  { annees: 3, plancher: 1 },
  { annees: 4, plancher: 1 },
  { annees: 5, plancher: 1.5 },
  { annees: 6, plancher: 1.5 },
  { annees: 7, plancher: 1.5 },
  { annees: 8, plancher: 1.5 },
  { annees: 9, plancher: 1.5 },
  { annees: 10, plancher: 2.5 },
];

// Tranches impôt sur le revenu 2026
const TRANCHES_IR = [
  { min: 0,      max: 11294,  taux: 0 },
  { min: 11294,  max: 28797,  taux: 0.11 },
  { min: 28797,  max: 82341,  taux: 0.30 },
  { min: 82341,  max: 177106, taux: 0.41 },
  { min: 177106, max: Infinity, taux: 0.45 },
];

// ================================================
// HELPERS DE CALCUL
// ================================================

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Barème Macron — retourne plancher et plafond en mois de salaire
 */
function getBaremeMacron(annees, petiteEntreprise) {
  const idx = Math.min(Math.floor(annees), 30);
  const row = BAREME_MACRON[idx] || BAREME_MACRON[30];
  let plancher = row.plancher;

  if (petiteEntreprise) {
    const tpeIdx = Math.min(Math.floor(annees), 10);
    const tpeRow = BAREME_TPE_PLANCHER[tpeIdx] || BAREME_TPE_PLANCHER[10];
    plancher = tpeRow.plancher;
  }

  return { plancher, plafond: row.plafond };
}

/**
 * Indemnité légale de licenciement — Art. L.1234-9, R.1234-2
 * 1/4 mois par année jusqu'à 10 ans + 1/3 mois par année au-delà
 * Ancienneté minimale : 8 mois (art. L.1234-9 modifié)
 */
function calculIndemniteLegale(anciennete, salaireRef) {
  if (anciennete < 0.67) return 0; // 8 mois minimum

  let indemnite = 0;
  if (anciennete <= 10) {
    indemnite = (1 / 4) * salaireRef * anciennete;
  } else {
    indemnite = (1 / 4) * salaireRef * 10 + (1 / 3) * salaireRef * (anciennete - 10);
  }
  return round2(indemnite);
}

/**
 * Indemnité de départ en retraite — Art. D.1237-1
 */
function calculIndemniteRetraite(anciennete, salaireRef) {
  if (anciennete < 10) return 0;
  if (anciennete < 15) return round2(0.5 * salaireRef);
  if (anciennete < 20) return round2(1 * salaireRef);
  if (anciennete < 30) return round2(1.5 * salaireRef);
  return round2(2 * salaireRef);
}

/**
 * Salaire de référence — Art. R.1234-4
 * Méthode 3 mois (avec prorata primes annuelles) vs Méthode 12 mois
 * Retenir le plus favorable au salarié
 */
function calculSalaireReference(salaires3mois, salaires12mois, primesAnnuelles, tempsPartielMixte) {
  // Méthode 3 mois (avec prorata primes annuelles : 3/12 = 1/4)
  const total3 = (salaires3mois || []).reduce((s, v) => s + v, 0);
  const prorataPrimes = (primesAnnuelles || 0) / 4; // 3 mois sur 12 = 1/4
  const methode3 = (total3 + prorataPrimes) / 3;

  // Méthode 12 mois
  const total12 = (salaires12mois || []).reduce((s, v) => s + v, 0);
  const methode12 = total12 / 12;

  // Temps partiel mixte : pondération si périodes différentes
  let salaireRefFinal = Math.max(methode3, methode12);
  let detailTempsPartiel = null;

  if (tempsPartielMixte && Array.isArray(tempsPartielMixte) && tempsPartielMixte.length > 0) {
    // tempsPartielMixte = [{ mois: 24, quotite: 1.0 }, { mois: 12, quotite: 0.8 }]
    const totalMois = tempsPartielMixte.reduce((s, p) => s + p.mois, 0);
    const quotiteMoyenne = tempsPartielMixte.reduce((s, p) => s + (p.mois * p.quotite), 0) / totalMois;
    detailTempsPartiel = {
      periodes: tempsPartielMixte,
      quotite_moyenne: round2(quotiteMoyenne),
      note: 'Salaire reconstitué sur la base d\'un temps plein pondéré par les différentes quotités (art. L.3123-5 Code du travail)'
    };
    // Le salaire de référence est déjà basé sur les bulletins réels
    // mais on indique la quotité pour que l'avocat puisse vérifier
  }

  return {
    methode_3mois: round2(methode3),
    methode_12mois: round2(methode12),
    salaire_ref: round2(salaireRefFinal),
    methode_retenue: methode3 >= methode12 ? '3 derniers mois (art. R.1234-4, 1°)' : '12 derniers mois (art. R.1234-4, 2°)',
    temps_partiel: detailTempsPartiel,
    references: ['Art. R.1234-4 Code du travail']
  };
}

/**
 * Calcul de l'indemnité selon la CCN
 * Compare légale vs conventionnelle, retient la plus favorable
 * Gère le doublement inaptitude PRO (art. L.1226-14)
 */
function calculIndemniteComplete(anciennete, salaireRef, statut, ccnIdcc, motif) {
  const indLegale = calculIndemniteLegale(anciennete, salaireRef);
  const motifConfig = MOTIFS_RUPTURE[motif] || {};

  // Cas spécial : démission, pas d'indemnité
  if (motif === 'demission') {
    return {
      legale: 0,
      conventionnelle: 0,
      retenue: 0,
      base: 'aucune',
      doublee: false,
      formule: 'Démission : aucune indemnité de licenciement',
      references: ['Art. L.1237-1 Code du travail']
    };
  }

  // Cas spécial : départ retraite
  if (motif === 'depart_retraite') {
    const indRetraite = calculIndemniteRetraite(anciennete, salaireRef);
    return {
      legale: indRetraite,
      conventionnelle: 0,
      retenue: indRetraite,
      base: 'légale (retraite)',
      doublee: false,
      formule: 'Indemnité de départ en retraite (art. D.1237-1)',
      references: ['Art. L.1237-9 Code du travail', 'Art. D.1237-1']
    };
  }

  // Pas d'indemnité si le motif ne le prévoit pas
  if (!motifConfig.indemnite) {
    return {
      legale: 0,
      conventionnelle: 0,
      retenue: 0,
      base: 'aucune',
      doublee: false,
      formule: `Motif "${motifConfig.libelle || motif}" : pas d'indemnité de licenciement`,
      references: motifConfig.references || []
    };
  }

  // Indemnité conventionnelle
  let indConv = 0;
  const ccn = CONVENTIONS_COLLECTIVES[ccnIdcc];
  if (ccn && typeof ccn.calcul_indemnite === 'function') {
    indConv = ccn.calcul_indemnite(anciennete, salaireRef, statut);
  }

  // Inaptitude professionnelle : doublement de l'indemnité LÉGALE uniquement
  // Art. L.1226-14 : l'indemnité spéciale = 2× indemnité légale
  // MAIS si la conventionnelle simple > légale doublée → prendre conventionnelle
  let doublee = false;
  let indLegaleFinale = indLegale;
  if (motif === 'inaptitude_pro') {
    const legaleDroublee = round2(indLegale * 2);
    if (indConv > legaleDroublee) {
      // Conventionnelle simple > légale doublée → conventionnelle s'applique
      indLegaleFinale = indLegale;
    } else {
      indLegaleFinale = legaleDroublee;
      doublee = true;
    }
  }

  // Retenir la plus favorable
  const indemniteRetenue = round2(Math.max(indLegaleFinale, indConv));
  let base;
  if (doublee && indLegaleFinale >= indConv) {
    base = 'légale doublée (inaptitude professionnelle, art. L.1226-14)';
  } else if (indConv > indLegaleFinale) {
    base = `conventionnelle (CCN ${ccnIdcc})`;
  } else {
    base = 'légale';
  }

  // Formule descriptive
  let formule;
  if (anciennete <= 10) {
    formule = `1/4 × ${salaireRef} × ${round2(anciennete)} = ${indLegale}`;
  } else {
    formule = `(1/4 × ${salaireRef} × 10) + (1/3 × ${salaireRef} × ${round2(anciennete - 10)}) = ${indLegale}`;
  }
  if (doublee) {
    formule += ` × 2 (inaptitude PRO) = ${indLegaleFinale}`;
  }

  return {
    legale: indLegale,
    legale_doublee: doublee ? indLegaleFinale : null,
    conventionnelle: indConv,
    retenue: indemniteRetenue,
    base,
    doublee,
    formule,
    ccn_appliquee: ccn ? { idcc: ccn.idcc, nom: ccn.nom } : null,
    references: [
      'Art. L.1234-9, R.1234-2 Code du travail (indemnité légale)',
      ...(doublee ? ['Art. L.1226-14 (doublement inaptitude professionnelle)'] : []),
      ...(ccn ? ccn.references : [])
    ]
  };
}

/**
 * Calcul du préavis
 */
function calculPreavis(anciennete, statut, ccnIdcc, motif) {
  const motifConfig = MOTIFS_RUPTURE[motif] || {};
  const ccn = CONVENTIONS_COLLECTIVES[ccnIdcc];

  // Motifs sans préavis
  if (motif === 'faute_grave' || motif === 'faute_lourde') {
    return {
      mois: 0,
      du: false,
      indemnite_compensatrice: false,
      note: 'Pas de préavis en cas de faute grave ou lourde',
      references: ['Art. L.1234-1 Code du travail']
    };
  }

  if (motif === 'inaptitude_non_pro') {
    return {
      mois: 0,
      du: false,
      indemnite_compensatrice: false,
      note: 'Inaptitude non professionnelle : pas de préavis ni d\'indemnité compensatrice',
      references: ['Art. L.1226-4 Code du travail']
    };
  }

  if (motif === 'inaptitude_pro') {
    // Préavis non exécuté mais indemnité compensatrice due
    const moisPreavis = _calculMoisPreavis(anciennete, statut, ccn);
    return {
      mois: moisPreavis,
      du: false,
      indemnite_compensatrice: true,
      note: 'Inaptitude professionnelle : préavis non exécuté mais indemnité compensatrice de préavis due (art. L.1226-14)',
      references: ['Art. L.1226-14 Code du travail']
    };
  }

  if (motif === 'rupture_conv') {
    return {
      mois: 0,
      du: false,
      indemnite_compensatrice: false,
      note: 'Rupture conventionnelle : pas de préavis',
      references: ['Art. L.1237-13 Code du travail']
    };
  }

  // Préavis légal/conventionnel
  const moisPreavis = _calculMoisPreavis(anciennete, statut, ccn);

  return {
    mois: moisPreavis,
    du: true,
    du_par: motif === 'demission' ? 'salarié' : 'employeur',
    indemnite_compensatrice: motif !== 'demission',
    references: ['Art. L.1234-1 Code du travail']
  };
}

function _calculMoisPreavis(anciennete, statut, ccn) {
  // Convention collective d'abord
  if (ccn && typeof ccn.preavis === 'function') {
    return ccn.preavis(anciennete, statut);
  }
  // Légal
  if (['cadre', 'cadre_dirigeant'].includes(statut)) return 3;
  if (anciennete >= 2) return 2;
  if (anciennete >= 0.5) return 1;
  return 0;
}

/**
 * Calcul des congés payés — Art. L.3141-24 à L.3141-31
 */
function calculCP(remunerationBruteAnnuelle, joursRestants, salaireMensuel) {
  if (!joursRestants || joursRestants <= 0) {
    return { montant: 0, methode_retenue: 'aucun CP restant' };
  }

  // Méthode du 10ème (art. L.3141-24, I)
  const totalCP = remunerationBruteAnnuelle * 0.10;
  const parJour10e = totalCP / 30; // 30 jours ouvrables = droit complet
  const methode10e = round2(parJour10e * joursRestants);

  // Méthode du maintien de salaire (art. L.3141-24, II)
  const parJourMaintien = salaireMensuel / 26; // 26 jours ouvrables par mois
  const methodeMaintien = round2(parJourMaintien * joursRestants);

  // Retenir la plus favorable (art. L.3141-24, III)
  return {
    methode_10e: methode10e,
    methode_maintien: methodeMaintien,
    montant: round2(Math.max(methode10e, methodeMaintien)),
    methode_retenue: methode10e > methodeMaintien ? '10ème (art. L.3141-24, I)' : 'maintien de salaire (art. L.3141-24, II)',
    jours_restants: joursRestants,
    references: ['Art. L.3141-24 à L.3141-31 Code du travail']
  };
}

/**
 * Indemnités spécifiques CDD
 */
function calculIndemnitesCDD(remunerationBruteTotale, motif, tauxPrecarite) {
  const taux = tauxPrecarite || 0.10;

  // Indemnité de précarité (art. L.1243-8)
  const indPrecarite = round2(remunerationBruteTotale * taux);

  // Indemnité compensatrice de congés payés (10 % de brut + précarité)
  const iccp = round2((remunerationBruteTotale + indPrecarite) * 0.10);

  // Rupture anticipée injustifiée par l'employeur : DI = salaires restant dus
  let note = 'Fin normale du CDD.';
  if (motif === 'rupture_anticipee_employeur') {
    note = 'Rupture anticipée par l\'employeur : le salarié a droit aux rémunérations qu\'il aurait perçues jusqu\'au terme du contrat (art. L.1243-4).';
  }

  return {
    indemnite_precarite: indPrecarite,
    taux_precarite: taux,
    iccp,
    note,
    references: [
      'Art. L.1243-8 Code du travail (indemnité de précarité)',
      'Art. L.1243-4 (rupture anticipée)',
      'Art. L.1242-16 (ICCP)'
    ]
  };
}

/**
 * Indemnités spécifiques Intérim
 */
function calculIndemnitesInterim(remunerationBruteTotale) {
  // IFM = 10 % de la rémunération brute totale (art. L.1251-32)
  const ifm = round2(remunerationBruteTotale * 0.10);

  // ICCP = 10 % de (brut + IFM) (art. L.1251-19)
  const iccp = round2((remunerationBruteTotale + ifm) * 0.10);

  return {
    ifm,
    ifm_taux: 0.10,
    iccp,
    iccp_taux: 0.10,
    iccp_assiette: round2(remunerationBruteTotale + ifm),
    total: round2(ifm + iccp),
    references: [
      'Art. L.1251-32 Code du travail (IFM 10 %)',
      'Art. L.1251-19 (ICCP 10 % de brut + IFM)'
    ]
  };
}

/**
 * Calcul fiscal complet — Art. 80 duodecies CGI
 * 3 options d'exonération IR, CSG/CRDS, cotisations sociales
 */
function calculImpactFiscal(indemniteTotale, indemniteLegaleOuConv, remunerationN1, tmiClient, motif, montantTransaction, honorairesAvocatHT, estPSE) {
  const motifConfig = MOTIFS_RUPTURE[motif] || {};

  // ===================== EXONÉRATION IR (art. 80 duodecies CGI) =====================
  let partExonereeIR;
  let detailExoneration;

  if (estPSE) {
    // PSE : exonération totale IR dans la limite de 6 PASS
    partExonereeIR = round2(Math.min(indemniteTotale, 6 * PASS_2026));
    detailExoneration = {
      regime: 'PSE — Exonération totale IR (art. 80 duodecies, 1° du 1)',
      plafond_6pass: 6 * PASS_2026,
      retenue: partExonereeIR
    };
  } else if (motif === 'depart_retraite') {
    // Indemnité de retraite : imposable en totalité (sauf option quotient)
    partExonereeIR = 0;
    detailExoneration = {
      regime: 'Départ retraite — Indemnité imposable (option quotient possible)',
      retenue: 0,
      note: 'L\'indemnité de départ en retraite est imposable. Le salarié peut opter pour le système du quotient (art. 163-0 A CGI).'
    };
  } else if (motif === 'demission') {
    // Démission : pas d'indemnité normalement
    partExonereeIR = 0;
    detailExoneration = { regime: 'Démission — Pas d\'exonération', retenue: 0 };
  } else {
    // Régime général : 3 options, retenir la plus favorable ≤ 6 PASS
    const option1 = indemniteLegaleOuConv || 0;          // Part légale ou conventionnelle
    const option2 = 2 * (remunerationN1 || 0);           // Double de la rémunération N-1
    const option3 = indemniteTotale * 0.5;                 // 50 % de l'indemnité totale
    const plafond6PASS = 6 * PASS_2026;

    partExonereeIR = round2(Math.min(Math.max(option1, option2, option3), plafond6PASS));
    detailExoneration = {
      regime: 'Art. 80 duodecies CGI — 3 options',
      option1_legale_conv: round2(option1),
      option2_double_remuneration_n1: round2(option2),
      option3_moitie_indemnite: round2(option3),
      plafond_6pass: plafond6PASS,
      retenue: partExonereeIR,
      option_retenue: option1 >= option2 && option1 >= option3 ? 'option 1 (légale/conventionnelle)'
        : option2 >= option3 ? 'option 2 (double rémunération N-1)'
        : 'option 3 (50 % de l\'indemnité)'
    };
  }

  const partImposableIR = round2(Math.max(0, indemniteTotale - partExonereeIR));

  // ===================== CSG / CRDS =====================
  // Assiette = indemnité totale - part exonérée de cotisations (légale ou conventionnelle)
  const partExonereeCotisations = indemniteLegaleOuConv || 0;
  const assietteCsgCrds = round2(Math.max(0, indemniteTotale - partExonereeCotisations));
  const csg = round2(assietteCsgCrds * CSG_TAUX);
  const csgDeductible = round2(assietteCsgCrds * CSG_DEDUCTIBLE);
  const csgNonDeductible = round2(assietteCsgCrds * (CSG_TAUX - CSG_DEDUCTIBLE));
  const crds = round2(assietteCsgCrds * CRDS_TAUX);

  // ===================== COTISATIONS SOCIALES =====================
  // Exonérées ≤ 2 PASS, tout soumis si > 10 PASS
  let cotisationsSociales = 0;
  let regimeCotisations;
  if (indemniteTotale > 10 * PASS_2026) {
    // Au-delà de 10 PASS : totalité soumise dès le 1er euro
    cotisationsSociales = round2(indemniteTotale * 0.22); // taux moyen salarié
    regimeCotisations = 'Indemnité > 10 PASS : totalité soumise à cotisations (art. L.242-1 CSS)';
  } else if (indemniteTotale > 2 * PASS_2026) {
    cotisationsSociales = round2((indemniteTotale - 2 * PASS_2026) * 0.22);
    regimeCotisations = 'Part > 2 PASS soumise à cotisations sociales';
  } else {
    regimeCotisations = 'Indemnité ≤ 2 PASS : exonérée de cotisations sociales';
  }

  // ===================== CONTRIBUTION EMPLOYEUR RUPTURE CONV (30 %) =====================
  let contributionRuptureConv = 0;
  if (motif === 'rupture_conv') {
    // 30 % sur la part exonérée de cotisations sociales (depuis 01/09/2023)
    contributionRuptureConv = round2(Math.min(partExonereeCotisations, indemniteTotale) * CONTRIBUTION_RUPTURE_CONV);
  }

  // ===================== IR sur la part imposable =====================
  const tmi = tmiClient || 0.30; // TMI par défaut 30 %
  const impotRevenu = round2(partImposableIR * tmi);

  // ===================== HONORAIRES AVOCAT =====================
  let honoraires = null;
  if (honorairesAvocatHT && honorairesAvocatHT > 0) {
    honoraires = {
      ht: round2(honorairesAvocatHT),
      tva: round2(honorairesAvocatHT * TVA_AVOCAT),
      ttc: round2(honorairesAvocatHT * (1 + TVA_AVOCAT))
    };
  }

  // ===================== NET CLIENT =====================
  const totalPrelevements = round2(csg + crds + cotisationsSociales + impotRevenu);
  const netAvantHonoraires = round2(indemniteTotale - totalPrelevements);
  const netClient = honoraires
    ? round2(netAvantHonoraires - honoraires.ttc)
    : netAvantHonoraires;

  return {
    indemnite_totale: indemniteTotale,
    exoneration_ir: detailExoneration,
    part_exoneree_ir: partExonereeIR,
    part_imposable_ir: partImposableIR,
    csg: {
      assiette: assietteCsgCrds,
      total: csg,
      deductible: csgDeductible,
      non_deductible: csgNonDeductible,
      taux: CSG_TAUX
    },
    crds: {
      montant: crds,
      taux: CRDS_TAUX
    },
    cotisations_sociales: {
      montant: cotisationsSociales,
      regime: regimeCotisations,
      seuil_2pass: 2 * PASS_2026,
      seuil_10pass: 10 * PASS_2026
    },
    contribution_rupture_conv: contributionRuptureConv > 0 ? {
      montant: contributionRuptureConv,
      taux: CONTRIBUTION_RUPTURE_CONV,
      note: 'Contribution employeur 30 % sur la part exonérée (art. L.137-12 CSS, depuis 01/09/2023)'
    } : null,
    impot_revenu: {
      montant: impotRevenu,
      tmi_applique: tmi,
      note: tmiClient ? 'TMI fourni par le client' : 'TMI par défaut 30 % — à ajuster selon la situation fiscale réelle'
    },
    total_prelevements: totalPrelevements,
    taux_effectif_prelevements: indemniteTotale > 0 ? round2((totalPrelevements / indemniteTotale) * 100) : 0,
    honoraires_avocat: honoraires,
    net_avant_honoraires: netAvantHonoraires,
    net_client: netClient,
    references: [
      'Art. 80 duodecies CGI (exonération IR)',
      'Art. L.136-2 CSS (CSG/CRDS)',
      'Art. L.242-1 CSS (cotisations sociales)',
      ...(motif === 'rupture_conv' ? ['Art. L.137-12 CSS (contribution employeur 30 %)'] : []),
      ...(estPSE ? ['Art. 80 duodecies, 1° du 1 CGI (exonération totale PSE ≤ 6 PASS)'] : [])
    ]
  };
}


// ================================================
// POST /simulation — Simulation complète (point d'entrée principal)
// ================================================
router.post('/simulation', requireAvocat, async (req, res) => {
  try {
    const {
      type_contrat,
      motif_rupture,
      statut,
      ccn_idcc,
      salaire_reference,
      salaires_3mois,
      salaires_12mois,
      primes_annuelles,
      temps_partiel_mixte,
      anciennete_annees,
      anciennete_mois,
      cadre,
      effectif_entreprise,
      preavis_effectue,
      jours_cp_restants,
      remuneration_brute_annuelle,
      remuneration_n1,
      origine_inaptitude,
      montant_transaction,
      honoraires_avocat_ht,
      tmi_client,
      // CDD spécifique
      remuneration_brute_totale_cdd,
      duree_restante_cdd_mois,
      taux_precarite,
      // Intérim spécifique
      remuneration_brute_totale_interim,
      // PSE
      est_pse
    } = req.body || {};

    const typeContrat = type_contrat || 'cdi';
    const motif = motif_rupture || 'scr';
    const statutSalarie = statut || (cadre ? 'cadre' : 'employe');
    const ccnIdcc = ccn_idcc ? parseInt(ccn_idcc, 10) : null;
    const petiteEntreprise = effectif_entreprise ? effectif_entreprise < 11 : false;

    // ===================== SALAIRE DE RÉFÉRENCE =====================
    let salaireRef = salaire_reference;
    let detailSalaire = null;

    if (salaires_3mois || salaires_12mois) {
      detailSalaire = calculSalaireReference(salaires_3mois, salaires_12mois, primes_annuelles, temps_partiel_mixte);
      salaireRef = detailSalaire.salaire_ref;
    }

    if (!salaireRef) {
      return res.status(400).json({ error: 'salaire_reference ou salaires_3mois/salaires_12mois requis' });
    }

    const anciennete = (anciennete_annees || 0) + (anciennete_mois || 0) / 12;
    const remN1 = remuneration_n1 || salaireRef * 12;
    const remBruteAnnuelle = remuneration_brute_annuelle || salaireRef * 12;

    // ===================== GESTION PAR TYPE DE CONTRAT =====================
    let indemnitesCDD = null;
    let indemnitesInterim = null;
    let noteApprentissage = null;

    if (typeContrat === 'cdd' && remuneration_brute_totale_cdd) {
      indemnitesCDD = calculIndemnitesCDD(
        remuneration_brute_totale_cdd,
        motif === 'scr' ? 'rupture_anticipee_employeur' : 'fin_normale',
        taux_precarite
      );
      if (motif === 'scr' && duree_restante_cdd_mois) {
        indemnitesCDD.di_rupture_anticipee = round2(salaireRef * duree_restante_cdd_mois);
        indemnitesCDD.note_rupture = `Rupture anticipée injustifiée : DI = salaires restant dus = ${salaireRef} × ${duree_restante_cdd_mois} mois (art. L.1243-4)`;
      }
    }

    if (typeContrat === 'interim' && remuneration_brute_totale_interim) {
      indemnitesInterim = calculIndemnitesInterim(remuneration_brute_totale_interim);
    }

    if (typeContrat === 'apprentissage') {
      noteApprentissage = {
        periode_libre: 'Rupture libre pendant les 45 premiers jours de formation pratique en entreprise (art. L.6222-18)',
        apres_45j: 'Après 45 jours : rupture uniquement pour faute grave, inaptitude, accord mutuel ou démission de l\'apprenti (art. L.6222-18)',
        references: ['Art. L.6222-18 Code du travail']
      };
    }

    // ===================== INDEMNITÉ DE LICENCIEMENT =====================
    const indemnite = calculIndemniteComplete(anciennete, salaireRef, statutSalarie, ccnIdcc, motif);

    // ===================== PRÉAVIS =====================
    const preavis = calculPreavis(anciennete, statutSalarie, ccnIdcc, motif);
    const indPreavis = (!preavis_effectue && preavis.du && preavis.du_par === 'employeur')
      ? round2(salaireRef * preavis.mois)
      : (preavis.indemnite_compensatrice && motif === 'inaptitude_pro')
        ? round2(salaireRef * preavis.mois)
        : 0;

    // ===================== CONGÉS PAYÉS =====================
    const cp = jours_cp_restants
      ? calculCP(remBruteAnnuelle, jours_cp_restants, salaireRef)
      : { montant: 0 };

    // ===================== BARÈME MACRON (si applicable) =====================
    const motifConfig = MOTIFS_RUPTURE[motif] || {};
    let baremeMacron = null;
    if (motifConfig.bareme_macron) {
      const bareme = getBaremeMacron(anciennete, petiteEntreprise);
      baremeMacron = {
        applicable: true,
        petite_entreprise: petiteEntreprise,
        effectif: effectif_entreprise || 'non précisé',
        plancher_mois: bareme.plancher,
        plafond_mois: bareme.plafond,
        plancher_euros: round2(bareme.plancher * salaireRef),
        plafond_euros: round2(bareme.plafond * salaireRef),
        median_euros: round2(((bareme.plancher + bareme.plafond) / 2) * salaireRef),
        references: ['Art. L.1235-3 Code du travail', 'Ordonnances n° 2017-1387 du 22 septembre 2017']
      };
    }

    // ===================== TOTAL BRUT =====================
    let totalBrut = round2(
      indemnite.retenue +
      indPreavis +
      (cp.montant || 0) +
      (baremeMacron ? baremeMacron.median_euros : 0) +
      (indemnitesCDD ? (indemnitesCDD.di_rupture_anticipee || 0) : 0)
    );

    // ===================== FISCAL COMPLET =====================
    const fiscal = calculImpactFiscal(
      totalBrut,
      indemnite.retenue,
      remN1,
      tmi_client,
      motif,
      montant_transaction,
      honoraires_avocat_ht,
      est_pse
    );

    // ===================== TRANSACTION (si montant fourni) =====================
    let optionTransaction = null;
    if (montant_transaction) {
      const fiscalTransaction = calculImpactFiscal(
        montant_transaction,
        indemnite.retenue,
        remN1,
        tmi_client,
        motif,
        montant_transaction,
        honoraires_avocat_ht,
        est_pse
      );
      optionTransaction = {
        montant_brut: montant_transaction,
        fiscal: fiscalTransaction,
        net_client: fiscalTransaction.net_client,
        immediat: true,
        delai: '1 à 2 mois (homologation DREETS si rupture conventionnelle)'
      };
    }

    // ===================== RÉSULTAT COMPLET =====================
    return res.json({
      parametres: {
        type_contrat: TYPES_CONTRAT[typeContrat] || { code: typeContrat },
        motif_rupture: {
          code: motif,
          libelle: motifConfig.libelle || motif,
          consequences: {
            indemnite: !!motifConfig.indemnite,
            preavis: !!motifConfig.preavis,
            conges_payes: !!motifConfig.conges_payes,
            bareme_macron: !!motifConfig.bareme_macron,
            chomage: !!motifConfig.chomage
          }
        },
        statut: STATUTS[statutSalarie] || { code: statutSalarie },
        ccn: ccnIdcc && CONVENTIONS_COLLECTIVES[ccnIdcc]
          ? { idcc: ccnIdcc, nom: CONVENTIONS_COLLECTIVES[ccnIdcc].nom }
          : null,
        salaire_reference: salaireRef,
        detail_salaire: detailSalaire,
        anciennete: {
          annees: anciennete_annees || 0,
          mois_supplementaires: anciennete_mois || 0,
          total_annees: round2(anciennete)
        },
        effectif_entreprise: effectif_entreprise || 'non précisé'
      },

      indemnite_licenciement: indemnite,

      preavis: {
        ...preavis,
        effectue: !!preavis_effectue,
        indemnite_compensatrice: indPreavis
      },

      conges_payes: cp,

      bareme_macron: baremeMacron || { applicable: false, note: `Le motif "${motifConfig.libelle || motif}" ne donne pas lieu à l'application du barème Macron.` },

      indemnites_cdd: indemnitesCDD,
      indemnites_interim: indemnitesInterim,
      note_apprentissage: noteApprentissage,

      total_brut: totalBrut,

      fiscal,

      option_transaction: optionTransaction,

      comparaison: optionTransaction && baremeMacron ? {
        tribunal_net_median: fiscal.net_client,
        tribunal_net_avec_alea_25pct: round2(fiscal.net_client * 0.75),
        transaction_net: optionTransaction.net_client,
        difference: round2(optionTransaction.net_client - fiscal.net_client * 0.75),
        recommandation: optionTransaction.net_client >= fiscal.net_client * 0.75
          ? 'La transaction semble favorable compte tenu de l\'aléa judiciaire et du délai de procédure (12 à 24 mois devant le conseil de prud\'hommes).'
          : 'Le passage au tribunal pourrait être plus avantageux si le dossier est solide. Délai estimé : 12 à 24 mois.',
        delai_tribunal: '12 à 24 mois (CPH) + appel éventuel'
      } : null,

      references_legales: [
        'Art. L.1234-9, R.1234-2, R.1234-4 — Indemnité de licenciement et salaire de référence',
        'Art. L.1234-1, L.1234-5 — Préavis',
        'Art. L.3141-24 à L.3141-31 — Congés payés',
        ...(baremeMacron ? ['Art. L.1235-3 — Barème Macron (ordonnances 22/09/2017)'] : []),
        'Art. 80 duodecies CGI — Régime fiscal des indemnités de rupture',
        'Art. L.136-2 CSS — CSG/CRDS sur revenus de remplacement',
        'Art. L.242-1 CSS — Assiette des cotisations sociales',
        ...(motif === 'inaptitude_pro' ? ['Art. L.1226-14 — Indemnité spéciale inaptitude professionnelle'] : []),
        ...(motif === 'rupture_conv' ? ['Art. L.137-12 CSS — Contribution employeur 30 % (depuis 01/09/2023)'] : []),
        ...(motifConfig.csp ? ['Art. L.1233-65 et s. — CSP'] : [])
      ],

      garde_fou: 'Cette simulation est indicative. Les résultats doivent être vérifiés par l\'avocat au regard de la convention collective applicable, de la situation personnelle du client et de la jurisprudence récente. Elle ne constitue pas un conseil juridique.'
    });
  } catch (err) {
    console.error('[simulateur/simulation]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul', detail: err.message });
  }
});


// ================================================
// POST /bareme-macron — Barème Macron seul
// ================================================
router.post('/bareme-macron', requireAvocat, async (req, res) => {
  try {
    const { salaire_reference, anciennete_annees, effectif_entreprise } = req.body || {};
    if (!salaire_reference || anciennete_annees == null) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees requis' });
    }

    const petiteEntreprise = effectif_entreprise ? effectif_entreprise < 11 : false;
    const bareme = getBaremeMacron(anciennete_annees, petiteEntreprise);

    return res.json({
      anciennete: anciennete_annees,
      salaire_reference,
      effectif_entreprise: effectif_entreprise || 'non précisé',
      petite_entreprise: petiteEntreprise,
      plancher_mois: bareme.plancher,
      plafond_mois: bareme.plafond,
      plancher_euros: round2(bareme.plancher * salaire_reference),
      plafond_euros: round2(bareme.plafond * salaire_reference),
      median_euros: round2(((bareme.plancher + bareme.plafond) / 2) * salaire_reference),
      references: [
        'Art. L.1235-3 Code du travail',
        'Ordonnances n° 2017-1387 du 22 septembre 2017',
        petiteEntreprise ? 'Art. L.1235-3, al. 2 (plancher réduit < 11 salariés)' : null
      ].filter(Boolean),
      garde_fou: 'Cette simulation est indicative. Les résultats doivent être vérifiés par l\'avocat.'
    });
  } catch (err) {
    console.error('[simulateur/bareme-macron]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});


// ================================================
// POST /indemnite-licenciement — Indemnité seule (légale + CCN)
// ================================================
router.post('/indemnite-licenciement', requireAvocat, async (req, res) => {
  try {
    const {
      salaire_reference, anciennete_annees, anciennete_mois,
      salaires_3mois, salaires_12mois, primes_annuelles,
      statut, ccn_idcc, motif_rupture
    } = req.body || {};

    let salaireRef = salaire_reference;
    let detailSalaire = null;

    if (salaires_3mois || salaires_12mois) {
      detailSalaire = calculSalaireReference(salaires_3mois, salaires_12mois, primes_annuelles);
      salaireRef = detailSalaire.salaire_ref;
    }

    if (!salaireRef || (!anciennete_annees && !anciennete_mois)) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees (ou anciennete_mois) requis' });
    }

    const anciennete = (anciennete_annees || 0) + (anciennete_mois || 0) / 12;
    const statutSalarie = statut || 'employe';
    const ccnIdcc = ccn_idcc ? parseInt(ccn_idcc, 10) : null;
    const motif = motif_rupture || 'faute_simple';

    const indemnite = calculIndemniteComplete(anciennete, salaireRef, statutSalarie, ccnIdcc, motif);

    return res.json({
      salaire_reference: salaireRef,
      detail_salaire: detailSalaire,
      anciennete_totale: round2(anciennete),
      ...indemnite,
      garde_fou: 'Cette simulation est indicative. Les résultats doivent être vérifiés par l\'avocat.'
    });
  } catch (err) {
    console.error('[simulateur/indemnite]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});


// ================================================
// POST /lecture-fiche-paie — Extraction IA (Mistral) depuis texte OCR
// ================================================
router.post('/lecture-fiche-paie', requireAvocat, async (req, res) => {
  try {
    const { texte_extrait } = req.body || {};
    if (!texte_extrait) return res.status(400).json({ error: 'texte_extrait requis (OCR de la fiche de paie)' });

    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu es un expert en lecture de fiches de paie françaises. Analyse ce bulletin et extrais TOUS les éléments. Retourne UNIQUEMENT du JSON strict :
{
  "salaire_base": 0,
  "primes": [{"nom":"","montant":0}],
  "heures_sup": {"nombre":0,"montant":0},
  "avantages_nature": 0,
  "brut_mensuel": 0,
  "net_imposable": 0,
  "net_a_payer": 0,
  "cumul_brut_annuel": 0,
  "anciennete_detectee": "",
  "convention_collective": "",
  "idcc": "",
  "date_entree": "",
  "qualification": "",
  "coefficient": "",
  "statut": "cadre|non_cadre|employé|agent_de_maitrise",
  "employeur": "",
  "salarie": "",
  "periode": "",
  "conges_restants": 0,
  "observations": []
}`;

    const result = await callMistral(system, texte_extrait.substring(0, 5000), { maxTokens: 1500, json: true });
    const match = result.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    if (!parsed) {
      return res.status(422).json({ error: 'Impossible d\'extraire les données de cette fiche de paie.' });
    }

    return res.json({
      extraction: parsed,
      salaire_reference_estime: parsed.brut_mensuel || parsed.salaire_base || 0,
      message: 'Extraction terminée. Vérifiez les montants avant de les utiliser dans le simulateur.',
      garde_fou: 'L\'extraction automatique peut contenir des erreurs. Comparez avec le bulletin original.'
    });
  } catch (err) {
    console.error('[simulateur/lecture-fiche-paie]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la lecture' });
  }
});


// ================================================
// GET /ccn — Liste des 10 CCN disponibles avec IDCC
// ================================================
router.get('/ccn', requireAvocat, async (req, res) => {
  const liste = Object.values(CONVENTIONS_COLLECTIVES).map(ccn => ({
    idcc: ccn.idcc,
    nom: ccn.nom,
    brochure: ccn.brochure,
    references: ccn.references
  }));

  return res.json({
    nombre: liste.length,
    conventions: liste,
    note: 'Si la convention collective du salarié ne figure pas dans cette liste, le calcul appliquera l\'indemnité légale (art. L.1234-9 et R.1234-2 Code du travail).'
  });
});


// ================================================
// GET /motifs — Liste des 12 motifs avec conséquences
// ================================================
router.get('/motifs', requireAvocat, async (req, res) => {
  const liste = Object.values(MOTIFS_RUPTURE).map(m => ({
    code: m.code,
    libelle: m.libelle,
    indemnite: !!m.indemnite || !!m.indemnite_retraite,
    preavis: !!m.preavis,
    conges_payes: !!m.conges_payes,
    bareme_macron: !!m.bareme_macron,
    chomage: !!m.chomage,
    note: m.note,
    references: m.references
  }));

  return res.json({
    nombre: liste.length,
    motifs: liste
  });
});


// ================================================
// GET /bareme-macron-table — Table complète du barème
// ================================================
router.get('/bareme-macron-table', requireAvocat, async (req, res) => {
  return res.json({
    pass_2026: PASS_2026,
    smic_mensuel_brut: SMIC_MENSUEL_BRUT,
    entreprises_11_plus: BAREME_MACRON,
    entreprises_moins_11: BAREME_TPE_PLANCHER,
    tranches_ir: TRANCHES_IR,
    references: [
      'Art. L.1235-3 Code du travail',
      'Ordonnances n° 2017-1387 du 22 septembre 2017',
      'Art. L.1235-3, al. 2 (plancher réduit TPE < 11 salariés)'
    ]
  });
});


// ================================================
// GET /regimes-fiscaux — Tableau récap par type de rupture
// ================================================
router.get('/regimes-fiscaux', requireAvocat, async (req, res) => {
  return res.json({
    pass_2026: PASS_2026,
    constantes: {
      csg_taux: CSG_TAUX,
      csg_deductible: CSG_DEDUCTIBLE,
      crds_taux: CRDS_TAUX,
      contribution_rupture_conv: CONTRIBUTION_RUPTURE_CONV
    },
    regimes: [
      {
        type: 'Licenciement (hors PSE)',
        exoneration_ir: '3 options art. 80 duodecies CGI : légale/conv, 2×N-1, ou 50 % indemnité (le plus favorable, plafonné 6 PASS)',
        csg_crds: 'Sur la part excédant l\'indemnité légale ou conventionnelle',
        cotisations: 'Exonérées ≤ 2 PASS, part excédentaire soumise, totalité si > 10 PASS',
        references: ['Art. 80 duodecies CGI', 'Art. L.242-1 CSS']
      },
      {
        type: 'Licenciement dans le cadre d\'un PSE',
        exoneration_ir: 'Exonération totale dans la limite de 6 PASS',
        csg_crds: 'Sur la part excédant l\'indemnité légale ou conventionnelle',
        cotisations: 'Exonérées ≤ 2 PASS',
        references: ['Art. 80 duodecies, 1° du 1 CGI']
      },
      {
        type: 'Rupture conventionnelle individuelle',
        exoneration_ir: 'Identique au licenciement (3 options art. 80 duodecies)',
        csg_crds: 'Sur la part excédant l\'indemnité légale ou conventionnelle',
        cotisations: 'Exonérées ≤ 2 PASS',
        contribution_employeur: '30 % sur la part exonérée de cotisations (depuis 01/09/2023)',
        references: ['Art. L.137-12 CSS', 'Art. 80 duodecies CGI']
      },
      {
        type: 'Départ volontaire à la retraite',
        exoneration_ir: 'Indemnité imposable en totalité (option système du quotient possible)',
        csg_crds: 'Totalité soumise',
        cotisations: 'Totalité soumise',
        references: ['Art. 80 duodecies CGI', 'Art. 163-0 A CGI (quotient)']
      },
      {
        type: 'Mise à la retraite par l\'employeur',
        exoneration_ir: '3 options art. 80 duodecies (identique licenciement)',
        csg_crds: 'Sur la part excédant l\'indemnité légale ou conventionnelle',
        cotisations: 'Exonérées ≤ 2 PASS',
        contribution_employeur: 'Contribution patronale (art. L.137-12 CSS)',
        references: ['Art. 80 duodecies CGI']
      },
      {
        type: 'Transaction (protocole transactionnel)',
        exoneration_ir: 'Part indemnitaire exonérée dans les mêmes conditions que l\'indemnité de rupture sous-jacente',
        csg_crds: 'Sur la part excédant l\'indemnité légale ou conventionnelle',
        cotisations: 'Exonérées ≤ 2 PASS sur la part indemnitaire',
        references: ['Art. 80 duodecies CGI', 'BOI-RSA-CHAMP-20-40-10-30']
      }
    ],
    garde_fou: 'Cette simulation est indicative. Les résultats doivent être vérifiés par l\'avocat.'
  });
});


module.exports = router;
