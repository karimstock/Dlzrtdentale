// =============================================
// JADOMI — Agenda CRUD avec catalogue d'actes dentaires complet
// Passe 74 — Catalogue 10 catégories, 80+ actes, séquences liées
// Fallback in-memory si table Supabase absente
// Endpoints : GET /, GET /catalogue, POST /, PUT /:id, DELETE /:id,
//             POST /seed, POST /suggestion-suite
// =============================================
const express = require('express');
const crypto = require('crypto');
const { admin, requireCabinet } = require('./shared');

const router = express.Router();

// ═══ Helper : garantir un cabinet_id même si la table n'existe pas ═══
function ensureCabinetId(req) {
  if (req.cabinet && req.cabinet.id) return req.cabinet.id;
  // Fallback : utiliser societe_id comme cabinet_id
  if (req.societe && req.societe.id) return req.societe.id;
  // Dernier recours : ID par défaut pour les tests
  return 'test-cabinet';
}

// Middleware local : patch req.cabinet si absent
router.use((req, res, next) => {
  // Sera appelé APRÈS requireCabinet() dans chaque route
  // On patche ici au cas où requireCabinet passe mais cabinet=null
  if (!req.cabinet) {
    req.cabinet = { id: ensureCabinetId(req), nom: 'Cabinet Test' };
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// CATALOGUE COMPLET DES ACTES DENTAIRES
// Basé sur la pratique réelle en cabinet omnipratique
// ═══════════════════════════════════════════════════════════════
const CATALOGUE_ACTES = {
  // ═══ CONSULTATION / DIAGNOSTIC ═══
  consultation: {
    label: 'Consultation / Diagnostic',
    couleur: '#3B82F6',
    actes: {
      'premiere_consultation': { label: 'Première consultation', duree: 30, notes: 'Examen clinique complet, radio panoramique, plan de traitement' },
      'consultation_urgence': { label: 'Consultation d\'urgence', duree: 20, notes: 'Douleur aiguë, diagnostic rapide' },
      'consultation_controle': { label: 'Contrôle / Suivi', duree: 15, notes: 'Contrôle périodique' },
      'bilan_parodontal': { label: 'Bilan parodontal complet', duree: 45, notes: 'Sondage, charting, radio rétro-alvéolaire' },
      'consultation_devis': { label: 'Consultation devis / plan de traitement', duree: 20, notes: 'Présentation plan de traitement et devis' },
      'radio_panoramique': { label: 'Radio panoramique', duree: 15, notes: 'Orthopantomogramme' },
      'radio_retro': { label: 'Radio rétro-alvéolaire', duree: 10, notes: 'Cliché unitaire' },
      'cone_beam': { label: 'CBCT / Cone Beam', duree: 20, notes: 'Imagerie 3D' }
    }
  },

  // ═══ SOINS CONSERVATEURS ═══
  conservateur: {
    label: 'Soins conservateurs',
    couleur: '#10B981',
    actes: {
      'soin_carie_1face': { label: 'Soin carie (1 face)', duree: 20, notes: 'Composite 1 face' },
      'soin_carie_2faces': { label: 'Soin carie (2 faces)', duree: 30, notes: 'Composite 2 faces' },
      'soin_carie_3faces': { label: 'Soin carie (3 faces)', duree: 40, notes: 'Composite 3 faces, reconstitution importante' },
      'coiffage_pulpaire': { label: 'Soin carie + coiffage pulpaire', duree: 40, notes: 'Carie profonde, protection pulpaire, CaOH2 ou MTA' },
      'inlay_onlay_empreinte': { label: 'Inlay/Onlay — empreinte', duree: 45, notes: 'Préparation + empreinte, provisoire' },
      'inlay_onlay_pose': { label: 'Inlay/Onlay — pose', duree: 30, notes: 'Collage inlay/onlay céramique ou composite', lien_precedent: 'inlay_onlay_empreinte', delai_jours: 10 },
      'scellement_sillon': { label: 'Scellement de sillons', duree: 15, notes: 'Prévention enfant/ado' }
    }
  },

  // ═══ ENDODONTIE ═══
  endodontie: {
    label: 'Endodontie',
    couleur: '#F59E0B',
    actes: {
      'endo_mono': { label: 'Traitement endodontique monoradiculé', duree: 45, notes: 'Incisive/canine, 1 canal' },
      'endo_premolaire': { label: 'Traitement endodontique prémolaire', duree: 60, notes: 'Prémolaire, 1-2 canaux' },
      'endo_molaire': { label: 'Traitement endodontique molaire', duree: 90, notes: 'Molaire, 3-4 canaux, digue obligatoire' },
      'retraitement_endo': { label: 'Retraitement endodontique', duree: 90, notes: 'Désobturation + retraitement, complexe' },
      'pulpotomie': { label: 'Pulpotomie', duree: 30, notes: 'Dent temporaire ou urgence' },
      'drainage_abces': { label: 'Drainage abcès / urgence endo', duree: 20, notes: 'Trépanation, drainage, prescription ATB' }
    }
  },

  // ═══ PARODONTOLOGIE ═══
  parodontologie: {
    label: 'Parodontologie',
    couleur: '#06B6D4',
    actes: {
      'detartrage': { label: 'Détartrage + polissage', duree: 30, notes: 'Détartrage sus et sous-gingival, polissage' },
      'surfacage_1secteur': { label: 'Surfaçage radiculaire (1 secteur)', duree: 45, notes: 'Sous anesthésie, 1 quadrant' },
      'surfacage_2secteurs': { label: 'Surfaçage radiculaire (2 secteurs)', duree: 90, notes: 'Sous anesthésie, hémi-arcade' },
      'debridement_general': { label: 'Débridement parodontal généralisé', duree: 60, notes: 'Parodontite généralisée, séance longue' },
      'maintenance_paro': { label: 'Maintenance parodontale', duree: 30, notes: 'Suivi trimestriel parodontite traitée' },
      'greffe_gingivale': { label: 'Greffe gingivale', duree: 90, notes: 'Chirurgie muco-gingivale' },
      'allongement_coronaire': { label: 'Allongement coronaire', duree: 60, notes: 'Chirurgie pré-prothétique' }
    }
  },

  // ═══ PROTHÈSE CONJOINTE (fixée) ═══
  prothese_conjointe: {
    label: 'Prothèse conjointe (fixée)',
    couleur: '#EC4899',
    actes: {
      'couronne_empreinte': { label: 'Couronne unitaire — préparation + empreinte', duree: 45, notes: 'Préparation, empreinte, provisoire' },
      'couronne_pose': { label: 'Couronne unitaire — pose / scellement', duree: 30, notes: 'Essayage + scellement définitif', lien_precedent: 'couronne_empreinte', delai_jours: 8 },
      'bridge_empreinte': { label: 'Bridge — préparation + empreinte', duree: 60, notes: 'Préparation piliers, empreinte globale' },
      'bridge_essayage': { label: 'Bridge — essayage armature', duree: 30, notes: 'Vérification adaptation, occlusion', lien_precedent: 'bridge_empreinte', delai_jours: 8 },
      'bridge_pose': { label: 'Bridge — pose / scellement', duree: 30, notes: 'Scellement définitif', lien_precedent: 'bridge_essayage', delai_jours: 8 },
      'bridge_complexe_empreinte': { label: 'Bridge complexe (>3 éléments) — empreinte', duree: 90, notes: 'Grande étendue, préparations multiples' },
      'bridge_complexe_essayage': { label: 'Bridge complexe — essayage', duree: 45, notes: 'Essayage armature + biscuit', lien_precedent: 'bridge_complexe_empreinte', delai_jours: 10 },
      'bridge_complexe_pose': { label: 'Bridge complexe — pose', duree: 45, notes: 'Scellement définitif', lien_precedent: 'bridge_complexe_essayage', delai_jours: 8 },
      'facette_empreinte': { label: 'Facette(s) — empreinte', duree: 45, notes: 'Préparation minimale, empreinte optique ou physique' },
      'facette_pose': { label: 'Facette(s) — collage', duree: 45, notes: 'Collage sous digue', lien_precedent: 'facette_empreinte', delai_jours: 10 },
      'descellement_recollage': { label: 'Descellement / recollage prothèse', duree: 20, notes: 'Rescellement couronne ou bridge' }
    }
  },

  // ═══ PROTHÈSE ADJOINTE (amovible) ═══
  prothese_adjointe: {
    label: 'Prothèse adjointe (amovible)',
    couleur: '#8B5CF6',
    actes: {
      'pap_empreinte_primaire': { label: 'PAP — empreinte primaire', duree: 30, notes: 'Empreinte alginate, choix porte-empreinte' },
      'pap_empreinte_secondaire': { label: 'PAP — empreinte secondaire + RIM', duree: 45, notes: 'Empreinte secondaire + rapport intermaxillaire (souvent même séance)' },
      'pap_essayage': { label: 'PAP — essayage dents', duree: 30, notes: 'Vérification esthétique et occlusion', lien_precedent: 'pap_empreinte_secondaire', delai_jours: 10 },
      'pap_livraison': { label: 'PAP — livraison', duree: 30, notes: 'Insertion, ajustage, conseils d\'hygiène', lien_precedent: 'pap_essayage', delai_jours: 8 },
      'pap_doleance_1': { label: 'PAP — doléance 1 (ajustage)', duree: 20, notes: 'Premiers ajustages post-livraison', lien_precedent: 'pap_livraison', delai_jours: 3 },
      'pap_doleance_2': { label: 'PAP — doléance 2', duree: 15, notes: 'Ajustages complémentaires', lien_precedent: 'pap_doleance_1', delai_jours: 7 },
      'pap_doleance_3': { label: 'PAP — doléance 3', duree: 15, notes: 'Derniers ajustages si nécessaire' },
      'pac_empreinte_primaire': { label: 'PAC totale — empreinte primaire', duree: 30, notes: 'Empreinte alginate mâchoire édentée' },
      'pac_empreinte_secondaire_rim': { label: 'PAC totale — secondaire + RIM', duree: 45, notes: 'Empreinte anatomo-fonctionnelle + rapport intermaxillaire' },
      'pac_essayage': { label: 'PAC totale — essayage', duree: 30, notes: 'Essayage cire, esthétique, phonétique', lien_precedent: 'pac_empreinte_secondaire_rim', delai_jours: 10 },
      'pac_livraison': { label: 'PAC totale — livraison', duree: 30, notes: 'Insertion + équilibration occlusale', lien_precedent: 'pac_essayage', delai_jours: 10 },
      'pac_doleance': { label: 'PAC — doléance / ajustage', duree: 20, notes: 'Réglages post-insertion' },
      'rebasage': { label: 'Rebasage prothèse', duree: 30, notes: 'Rebasage résine au fauteuil ou empreinte labo' },
      'reparation_prothese': { label: 'Réparation prothèse amovible', duree: 30, notes: 'Fracture, rajout dent, crochet' },
      'empreinte_numerique_pap': { label: 'PAP — empreinte numérique', duree: 30, notes: 'Scan intra-oral, workflow numérique' }
    }
  },

  // ═══ CHIRURGIE ═══
  chirurgie: {
    label: 'Chirurgie',
    couleur: '#EF4444',
    actes: {
      'extraction_simple': { label: 'Extraction simple', duree: 20, notes: 'Dent visible, mobilisable' },
      'extraction_complexe': { label: 'Extraction complexe / chirurgicale', duree: 45, notes: 'Racines divergentes, alvéolectomie' },
      'extraction_dds': { label: 'Extraction dent de sagesse', duree: 45, notes: 'Dent incluse ou semi-incluse, lambeau' },
      'extractions_multiples': { label: 'Extractions multiples (même séance)', duree: 60, notes: '2-4 extractions, même quadrant' },
      'biopsie': { label: 'Biopsie / exérèse lésion', duree: 30, notes: 'Exérèse + envoi anapath' },
      'freinectomie': { label: 'Freinectomie', duree: 30, notes: 'Frein labial ou lingual' },
      'implant_pose': { label: 'Pose implant unitaire', duree: 60, notes: 'Chirurgie implantaire, forage + pose fixture' },
      'implant_pilier': { label: 'Implant — mise en fonction / pilier', duree: 30, notes: 'Pose pilier de cicatrisation ou définitif', lien_precedent: 'implant_pose', delai_jours: 90 },
      'comblement_osseux': { label: 'Comblement osseux / greffe', duree: 60, notes: 'Greffe osseuse, ROG, membrane' },
      'avulsion_multiple_pap': { label: 'Avulsions + prothèse immédiate', duree: 90, notes: 'Extractions multiples + insertion prothèse transitoire' }
    }
  },

  // ═══ ORTHODONTIE ═══
  orthodontie: {
    label: 'Orthodontie',
    couleur: '#A855F7',
    actes: {
      'consultation_ortho': { label: 'Consultation orthodontique', duree: 30, notes: 'Examen, moulages, photos, plan de traitement' },
      'pose_multi_attache': { label: 'Pose appareil multi-attaches', duree: 60, notes: 'Collage brackets + arc initial' },
      'ajustement_arc': { label: 'Ajustement / activation arc', duree: 20, notes: 'Changement arc, ligatures, élastiques' },
      'controle_aligneurs': { label: 'Contrôle aligneurs', duree: 15, notes: 'Vérification adaptation Invisalign/SureSmile' },
      'depose_appareil': { label: 'Dépose appareil + contention', duree: 45, notes: 'Dépose, polissage, fil de contention collé' },
      'contention_controle': { label: 'Contrôle contention', duree: 15, notes: 'Vérification fil collé ou gouttière' }
    }
  },

  // ═══ ESTHÉTIQUE / BLANCHIMENT ═══
  esthetique: {
    label: 'Esthétique / Blanchiment',
    couleur: '#FBBF24',
    actes: {
      'blanchiment_empreinte': { label: 'Blanchiment — empreinte gouttières', duree: 20, notes: 'Empreinte alginate ou scan pour gouttières ambulatoires' },
      'blanchiment_livraison': { label: 'Blanchiment — livraison gouttières', duree: 20, notes: 'Essayage gouttières + instructions gel', lien_precedent: 'blanchiment_empreinte', delai_jours: 5 },
      'blanchiment_fauteuil': { label: 'Blanchiment au fauteuil', duree: 90, notes: 'Peroxyde haute concentration, lampe, séance complète' },
      'composite_esthetique': { label: 'Composite esthétique antérieur', duree: 45, notes: 'Stratification composite, diastème, forme' },
      'micro_abrasion': { label: 'Micro-abrasion / érosion-infiltration', duree: 30, notes: 'Traitement taches blanches fluorose/MIH' }
    }
  },

  // ═══ PÉDODONTIE (enfants) ═══
  pedodontie: {
    label: 'Pédodontie (enfants)',
    couleur: '#34D399',
    actes: {
      'examen_enfant': { label: 'Examen enfant / EBD', duree: 20, notes: 'Examen bucco-dentaire, motivation hygiène' },
      'soin_dent_lait': { label: 'Soin sur dent temporaire', duree: 20, notes: 'Composite ou CVI dent lactéale' },
      'coiffe_pediatrique': { label: 'Coiffe pédodontique', duree: 30, notes: 'Coiffe préformée inox ou zircone' },
      'meopa': { label: 'Soin sous MEOPA', duree: 45, notes: 'Sédation consciente protoxyde d\'azote, enfant anxieux' },
      'application_fluor': { label: 'Application fluor / vernis', duree: 15, notes: 'Prévention carie' }
    }
  }
};

// ═══ Mapping rétrocompatible ancien type → catégorie ═══
const MAPPING_ANCIEN_TYPE = {
  'consultation': { categorie: 'consultation', acte: 'premiere_consultation' },
  'suivi': { categorie: 'consultation', acte: 'consultation_controle' },
  'urgence': { categorie: 'consultation', acte: 'consultation_urgence' },
  'bilan': { categorie: 'consultation', acte: 'bilan_parodontal' },
  'extraction': { categorie: 'chirurgie', acte: 'extraction_simple' },
  'detartrage': { categorie: 'parodontologie', acte: 'detartrage' },
  'prothese': { categorie: 'prothese_conjointe', acte: 'couronne_empreinte' },
  'orthodontie': { categorie: 'orthodontie', acte: 'consultation_ortho' }
};

// ═══ Helpers catalogue ═══

// Rechercher un acte dans le catalogue (retourne { categorie, acteKey, acteData, categorieData })
function trouverActe(acteKey) {
  for (const [catKey, cat] of Object.entries(CATALOGUE_ACTES)) {
    if (cat.actes[acteKey]) {
      return { categorie: catKey, acteKey, acteData: cat.actes[acteKey], categorieData: cat };
    }
  }
  return null;
}

// Trouver quel acte a un lien_precedent pointant vers acteKey (= l'acte suivant)
function trouverActeSuivant(acteKey) {
  for (const [catKey, cat] of Object.entries(CATALOGUE_ACTES)) {
    for (const [aKey, aData] of Object.entries(cat.actes)) {
      if (aData.lien_precedent === acteKey) {
        return { categorie: catKey, acteKey: aKey, acteData: aData, categorieData: cat };
      }
    }
  }
  return null;
}

// Calculer la suggestion de prochain RDV
function calculerSuggestionSuite(acteKey, dateHeure) {
  const suivant = trouverActeSuivant(acteKey);
  if (!suivant) return null;

  const dateBase = new Date(dateHeure);
  const dateSuggestion = new Date(dateBase);
  dateSuggestion.setDate(dateSuggestion.getDate() + suivant.acteData.delai_jours);

  return {
    acte_suivant: suivant.acteKey,
    label: suivant.acteData.label,
    categorie: suivant.categorie,
    duree_minutes: suivant.acteData.duree,
    date_suggeree: dateSuggestion.toISOString().slice(0, 10),
    delai_jours: suivant.acteData.delai_jours,
    notes: suivant.acteData.notes
  };
}

// Valider catégorie + acte
function validerCategorieActe(categorie, acte) {
  if (!CATALOGUE_ACTES[categorie]) {
    return { valide: false, erreur: `Catégorie "${categorie}" inconnue. Catégories : ${Object.keys(CATALOGUE_ACTES).join(', ')}` };
  }
  if (!CATALOGUE_ACTES[categorie].actes[acte]) {
    const actesDisponibles = Object.keys(CATALOGUE_ACTES[categorie].actes).join(', ');
    return { valide: false, erreur: `Acte "${acte}" inconnu dans la catégorie "${categorie}". Actes : ${actesDisponibles}` };
  }
  return { valide: true };
}

// Valider un tableau d'actes (multi-actes par séance)
function validerActesArray(actesArray) {
  if (!Array.isArray(actesArray) || actesArray.length === 0) {
    return { valide: false, erreur: 'Le tableau d\'actes est vide' };
  }
  const normalized = [];
  let totalDuree = 0;
  for (const item of actesArray) {
    const cat = item.categorie;
    const acte = item.acte;
    if (!cat || !acte) {
      return { valide: false, erreur: 'Chaque acte doit avoir une catégorie et un acte' };
    }
    const v = validerCategorieActe(cat, acte);
    if (!v.valide) return v;
    const catData = CATALOGUE_ACTES[cat];
    const acteData = catData.actes[acte];
    const duree = parseInt(item.duree_minutes) || acteData.duree;
    const dents = Array.isArray(item.dents) ? item.dents.filter(d => d >= 11 && d <= 48) : [];
    normalized.push({
      categorie: cat,
      acte: acte,
      label: acteData.label,
      duree_minutes: duree,
      dents: dents,
      couleur: catData.couleur,
      notes: item.notes || acteData.notes
    });
    totalDuree += duree;
  }
  return { valide: true, normalizedActes: normalized, totalDuree };
}

// ===== Store en mémoire (fallback si table inexistante) =====
let memoryStore = [];
let useMemory = false;
let modeDetected = false;

// Détection du mode (Supabase ou mémoire)
async function detectMode(cabinetId) {
  if (modeDetected) return;
  try {
    const { error } = await admin()
      .from('dentiste_pro_agenda')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      useMemory = true;
      console.log('[agenda] Table dentiste_pro_agenda inexistante — mode IN-MEMORY activé');
    } else if (error) {
      console.warn('[agenda] Erreur Supabase:', error.message, '— mode IN-MEMORY activé');
      useMemory = true;
    } else {
      useMemory = false;
      console.log('[agenda] Table dentiste_pro_agenda détectée — mode SUPABASE activé');
    }
  } catch (e) {
    useMemory = true;
    console.warn('[agenda] Exception détection:', e.message, '— mode IN-MEMORY activé');
  }
  modeDetected = true;
}

// ===== Helpers dates =====
function getLundiSemaine(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const lundi = new Date(d);
  lundi.setDate(diff);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

function getSamediSemaine(dateStr) {
  const lundi = getLundiSemaine(dateStr);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  samedi.setHours(23, 59, 59, 999);
  return samedi;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// =========================================================
// GET /catalogue — Catalogue complet des actes dentaires
// Endpoint public (données de référence)
// =========================================================
router.get('/catalogue', (req, res) => {
  // Construire un résumé avec statistiques
  const resume = {};
  let totalActes = 0;
  for (const [catKey, cat] of Object.entries(CATALOGUE_ACTES)) {
    const nbActes = Object.keys(cat.actes).length;
    totalActes += nbActes;
    resume[catKey] = {
      label: cat.label,
      couleur: cat.couleur,
      nombre_actes: nbActes
    };
  }

  res.json({
    catalogue: CATALOGUE_ACTES,
    resume,
    total_categories: Object.keys(CATALOGUE_ACTES).length,
    total_actes: totalActes
  });
});

// =========================================================
// GET / — Liste des rendez-vous sur une plage de dates
// Query params : debut (YYYY-MM-DD), fin (YYYY-MM-DD)
// Défaut : semaine courante (lundi au samedi)
// PAS D'AUTH — mode test pour validation
// =========================================================
router.get('/', async (req, res) => {
  try {
    var cabinetId = (req.cabinet && req.cabinet.id) || (req.societe && req.societe.id) || 'test';
    if (!req.cabinet) req.cabinet = { id: cabinetId, nom: 'Mode Test' };
    await detectMode(cabinetId);

    const debut = req.query.debut || toDateStr(getLundiSemaine());
    const fin = req.query.fin || toDateStr(getSamediSemaine());

    if (useMemory) {
      const filtered = memoryStore.filter(rdv => {
        if (rdv.cabinet_id !== req.cabinet.id) return false;
        const d = rdv.date_heure.slice(0, 10);
        return d >= debut && d <= fin;
      });
      filtered.sort((a, b) => a.date_heure.localeCompare(b.date_heure));
      return res.json({ rdv: filtered, total: filtered.length, mode: 'memory', debut, fin });
    }

    // Mode Supabase
    const debutISO = new Date(debut + 'T00:00:00').toISOString();
    const finISO = new Date(fin + 'T23:59:59').toISOString();

    const { data, error, count } = await admin()
      .from('dentiste_pro_agenda')
      .select('*', { count: 'exact' })
      .eq('cabinet_id', req.cabinet.id)
      .gte('date_heure', debutISO)
      .lte('date_heure', finISO)
      .order('date_heure', { ascending: true });

    if (error) throw error;

    res.json({ rdv: data || [], total: count || 0, mode: 'supabase', debut, fin });
  } catch (e) {
    console.error('[agenda] list:', e.message);
    res.status(500).json({ error: 'Erreur chargement agenda' });
  }
});

// =========================================================
// POST / — Créer un rendez-vous
// Body : patient_nom, patient_prenom, date_heure,
//        categorie, acte (nouveau système)
//        OU type (ancien système, rétrocompatible)
//        duree_minutes (optionnel, auto-rempli depuis catalogue)
//        notes (optionnel, auto-rempli depuis catalogue)
//        couleur (optionnel, auto-rempli depuis catégorie)
// =========================================================
router.post('/', async (req, res) => {
  try {
    if (!req.cabinet) req.cabinet = { id: (req.societe && req.societe.id) || 'default', nom: 'Precision Dentaire' };
    await detectMode(req.cabinet.id);

    let { patient_nom, patient_prenom, patient_tel, patient_email, date_heure, duree_minutes, type, categorie, acte, notes, couleur } = req.body || {};

    // Accepter aussi les formats alternatifs du frontend
    if (!date_heure && req.body.debut) date_heure = req.body.debut;
    if (!date_heure && req.body.start) date_heure = req.body.start;
    if (!duree_minutes && req.body.duree) duree_minutes = req.body.duree;

    if (!patient_nom || !date_heure) {
      return res.status(400).json({ error: 'patient_nom et date_heure sont obligatoires' });
    }

    // Rétrocompatibilité : si ancien champ "type" envoyé sans categorie/acte
    if (type && !categorie && !acte) {
      const mapping = MAPPING_ANCIEN_TYPE[type.toLowerCase()];
      if (!mapping) {
        return res.status(400).json({
          error: `Type "${type}" inconnu. Utilisez le nouveau système categorie/acte ou les anciens types : ${Object.keys(MAPPING_ANCIEN_TYPE).join(', ')}`
        });
      }
      categorie = mapping.categorie;
      acte = mapping.acte;
    }

    // ── Multi-actes : si le body contient un tableau actes[] ──
    const actesInput = req.body.actes;
    let actesArray = null;

    if (Array.isArray(actesInput) && actesInput.length > 0) {
      const validation = validerActesArray(actesInput);
      if (!validation.valide) {
        return res.status(400).json({ error: validation.erreur });
      }
      actesArray = validation.normalizedActes;
      // Le premier acte définit les champs principaux (rétrocompat)
      categorie = actesArray[0].categorie;
      acte = actesArray[0].acte;
      duree_minutes = validation.totalDuree;
    } else {
      // Mode classique : un seul acte
      if (!categorie) categorie = 'consultation';
      if (!acte) acte = 'premiere_consultation';

      const validation = validerCategorieActe(categorie, acte);
      if (!validation.valide) {
        return res.status(400).json({ error: validation.erreur });
      }
      // Normaliser en tableau d'un seul élément
      const catData = CATALOGUE_ACTES[categorie];
      const acteData = catData.actes[acte];
      const dents = Array.isArray(req.body.dents) ? req.body.dents.filter(d => d >= 11 && d <= 48) : [];
      actesArray = [{
        categorie, acte, label: acteData.label,
        duree_minutes: parseInt(duree_minutes) || acteData.duree,
        dents, couleur: catData.couleur, notes: acteData.notes
      }];
      duree_minutes = actesArray[0].duree_minutes;
    }

    // Auto-remplissage depuis le catalogue (premier acte = acte principal)
    const catData = CATALOGUE_ACTES[categorie];
    const acteData = catData.actes[acte];

    const rdvData = {
      cabinet_id: req.cabinet.id,
      patient_nom: patient_nom.trim(),
      patient_prenom: (patient_prenom || '').trim() || null,
      patient_tel: (patient_tel || '').trim() || null,
      patient_email: (patient_email || '').trim() || null,
      date_heure: new Date(date_heure).toISOString(),
      duree_minutes: parseInt(duree_minutes) || acteData.duree,
      categorie: categorie,
      acte: acte,
      actes: actesArray,
      type: categorie, // Rétrocompatibilité : on garde le champ type = categorie
      notes: (notes || '').trim() || acteData.notes,
      couleur: (couleur || '').trim() || catData.couleur,
      created_at: new Date().toISOString()
    };

    // Construire la réponse
    let responseData;

    if (useMemory) {
      rdvData.id = crypto.randomUUID();
      memoryStore.push(rdvData);
      responseData = { rdv: rdvData, mode: 'memory' };
    } else {
      // Mode Supabase
      const { data, error } = await admin()
        .from('dentiste_pro_agenda')
        .insert(rdvData)
        .select()
        .single();

      if (error) throw error;
      responseData = { rdv: data, mode: 'supabase' };
    }

    // Suggestion de prochain RDV si l'acte fait partie d'une séquence
    const suggestion = calculerSuggestionSuite(acte, rdvData.date_heure);
    if (suggestion) {
      responseData.suggestion_prochain_rdv = suggestion;
    }

    // Envoi email de confirmation au patient (si email fourni)
    if (rdvData.patient_email) {
      try {
        const trackingId = crypto.randomUUID();
        const dateRdv = new Date(rdvData.date_heure);
        const heureStr = dateRdv.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
        const dateStr = dateRdv.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const confirmUrl = `${baseUrl}/api/dentiste-pro/agenda/confirm/${trackingId}`;
        const pixelUrl = `${baseUrl}/api/dentiste-pro/agenda/track/${trackingId}/pixel.png`;

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const emailHtml = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;background:#fafafa;border-radius:16px;overflow:hidden">
            <div style="background:#0d9488;padding:24px;text-align:center">
              <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px">JADOMI</div>
            </div>
            <div style="padding:32px 24px">
              <p style="font-size:16px;color:#333;margin-bottom:16px">Bonjour <strong>${rdvData.patient_prenom || ''} ${rdvData.patient_nom}</strong>,</p>
              <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px">
                Votre rendez-vous est confirmé pour le <strong>${dateStr}</strong> à <strong>${heureStr}</strong>.
              </p>
              <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
                <div style="font-size:14px;color:#0d9488;font-weight:600;margin-bottom:4px">${dateStr}</div>
                <div style="font-size:28px;font-weight:800;color:#0f766e">${heureStr}</div>
                <div style="font-size:13px;color:#666;margin-top:4px">${acteData.label || 'Consultation'}</div>
              </div>
              <div style="text-align:center;margin-bottom:24px">
                <a href="${confirmUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600">Confirmer ma présence</a>
              </div>
              <p style="font-size:12px;color:#999;text-align:center">Si vous devez annuler ou reporter, contactez le cabinet.</p>
            </div>
            <div style="padding:16px;text-align:center;border-top:1px solid #eee">
              <span style="font-size:11px;color:#bbb">JADOMI — Votre cabinet dentaire</span>
            </div>
            <img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />
          </div>
        `;

        await transporter.sendMail({
          from: '"JADOMI" <noreply@jadomi.fr>',
          to: rdvData.patient_email,
          subject: `Rendez-vous confirmé — ${dateStr} à ${heureStr}`,
          html: emailHtml,
        });

        // Stocker le tracking dans le RDV
        const trackUpdate = { email_sent: true, email_tracking_id: trackingId };
        if (useMemory) {
          const idx = memoryStore.findIndex(r => r.id === (responseData.rdv.id || rdvData.id));
          if (idx >= 0) Object.assign(memoryStore[idx], trackUpdate);
        } else {
          await admin().from('dentiste_pro_agenda').update(trackUpdate).eq('id', responseData.rdv.id);
        }

        console.log(`[agenda] Email confirmation envoyé à ${rdvData.patient_email} (tracking: ${trackingId})`);
      } catch (emailErr) {
        console.warn('[agenda] Email confirmation error:', emailErr.message);
      }
    }

    res.status(201).json(responseData);
  } catch (e) {
    console.error('[agenda] create:', e.message);
    res.status(500).json({ error: 'Erreur création rendez-vous' });
  }
});

// =========================================================
// PUT /:id — Mettre à jour un rendez-vous
// Body : champs à modifier (supporte categorie/acte + ancien type)
// =========================================================
router.put('/:id', async (req, res) => {
  try {
    if (!req.cabinet) req.cabinet = { id: (req.societe && req.societe.id) || 'default', nom: 'Precision Dentaire' };
    await detectMode(req.cabinet.id);

    const { id } = req.params;
    // Mapper les champs alternatifs du frontend
    if (req.body.debut && !req.body.date_heure) req.body.date_heure = req.body.debut;
    if (req.body.start && !req.body.date_heure) req.body.date_heure = req.body.start;
    if (req.body.duree && !req.body.duree_minutes) req.body.duree_minutes = req.body.duree;

    const allowed = ['patient_nom', 'patient_prenom', 'patient_tel', 'patient_email', 'date_heure', 'duree_minutes', 'type', 'categorie', 'acte', 'actes', 'notes', 'couleur', 'heure_debut_reelle', 'heure_fin_reelle', 'statut', 'heure_arrivee', 'copilot_actes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Si actes[] est fourni, valider et recalculer
    if (Array.isArray(updates.actes) && updates.actes.length > 0) {
      const validation = validerActesArray(updates.actes);
      if (!validation.valide) {
        return res.status(400).json({ error: validation.erreur });
      }
      updates.actes = validation.normalizedActes;
      updates.duree_minutes = validation.totalDuree;
      updates.categorie = validation.normalizedActes[0].categorie;
      updates.acte = validation.normalizedActes[0].acte;
      updates.couleur = validation.normalizedActes[0].couleur;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    // Rétrocompatibilité : si ancien "type" envoyé sans categorie/acte
    if (updates.type && !updates.categorie && !updates.acte) {
      const mapping = MAPPING_ANCIEN_TYPE[updates.type.toLowerCase()];
      if (mapping) {
        updates.categorie = mapping.categorie;
        updates.acte = mapping.acte;
      }
    }

    // Si catégorie et/ou acte fournis, valider et auto-remplir
    if (updates.categorie || updates.acte) {
      // Il faut les deux pour valider
      const cat = updates.categorie || 'consultation';
      const act = updates.acte || 'premiere_consultation';

      const validation = validerCategorieActe(cat, act);
      if (!validation.valide) {
        return res.status(400).json({ error: validation.erreur });
      }

      const catData = CATALOGUE_ACTES[cat];
      const acteData = catData.actes[act];

      updates.categorie = cat;
      updates.acte = act;
      updates.type = cat; // Rétrocompatibilité

      // Auto-remplissage si pas explicitement fourni
      if (!req.body.duree_minutes) updates.duree_minutes = acteData.duree;
      if (!req.body.couleur) updates.couleur = catData.couleur;
      if (!req.body.notes) updates.notes = acteData.notes;
    }

    // Convertir date_heure en ISO si fourni
    if (updates.date_heure) {
      updates.date_heure = new Date(updates.date_heure).toISOString();
    }
    if (updates.duree_minutes) {
      updates.duree_minutes = parseInt(updates.duree_minutes);
    }

    updates.updated_at = new Date().toISOString();

    if (useMemory) {
      const idx = memoryStore.findIndex(r => r.id === id && r.cabinet_id === req.cabinet.id);
      if (idx === -1) return res.status(404).json({ error: 'Rendez-vous non trouvé' });
      Object.assign(memoryStore[idx], updates);

      const responseData = { rdv: memoryStore[idx], mode: 'memory' };

      // Suggestion suite si acte mis à jour
      if (updates.acte) {
        const suggestion = calculerSuggestionSuite(updates.acte, memoryStore[idx].date_heure);
        if (suggestion) responseData.suggestion_prochain_rdv = suggestion;
      }

      return res.json(responseData);
    }

    // Mode Supabase
    const { data, error } = await admin()
      .from('dentiste_pro_agenda')
      .update(updates)
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Rendez-vous non trouvé' });

    const responseData = { rdv: data, mode: 'supabase' };

    // Suggestion suite si acte mis à jour
    if (updates.acte) {
      const suggestion = calculerSuggestionSuite(updates.acte, data.date_heure);
      if (suggestion) responseData.suggestion_prochain_rdv = suggestion;
    }

    res.json(responseData);
  } catch (e) {
    console.error('[agenda] update:', e.message);
    res.status(500).json({ error: 'Erreur mise à jour rendez-vous' });
  }
});

// =========================================================
// DELETE /:id — Supprimer un rendez-vous
// =========================================================
router.delete('/:id', async (req, res) => {
  try {
    if (!req.cabinet) req.cabinet = { id: (req.societe && req.societe.id) || 'default', nom: 'Precision Dentaire' };
    await detectMode(req.cabinet.id);

    const { id } = req.params;

    if (useMemory) {
      const idx = memoryStore.findIndex(r => r.id === id && r.cabinet_id === req.cabinet.id);
      if (idx === -1) return res.status(404).json({ error: 'Rendez-vous non trouvé' });
      const deleted = memoryStore.splice(idx, 1)[0];
      return res.json({ message: 'Rendez-vous supprimé', rdv: deleted, mode: 'memory' });
    }

    // Mode Supabase
    const { data, error } = await admin()
      .from('dentiste_pro_agenda')
      .delete()
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Rendez-vous non trouvé' });

    res.json({ message: 'Rendez-vous supprimé', rdv: data, mode: 'supabase' });
  } catch (e) {
    console.error('[agenda] delete:', e.message);
    res.status(500).json({ error: 'Erreur suppression rendez-vous' });
  }
});

// =========================================================
// POST /suggestion-suite — Suggérer le prochain RDV d'une séquence
// Body : { acte, date_heure }
// Retourne l'acte suivant avec date suggérée si séquence liée
// =========================================================
router.post('/suggestion-suite', async (req, res) => {
  try {
    const { acte, date_heure } = req.body || {};

    if (!acte || !date_heure) {
      return res.status(400).json({ error: 'acte et date_heure sont obligatoires' });
    }

    // Vérifier que l'acte existe dans le catalogue
    const acteInfo = trouverActe(acte);
    if (!acteInfo) {
      return res.status(400).json({ error: `Acte "${acte}" inconnu dans le catalogue` });
    }

    const suggestion = calculerSuggestionSuite(acte, date_heure);

    if (!suggestion) {
      return res.json({
        message: 'Cet acte ne fait pas partie d\'une séquence liée',
        acte_actuel: {
          acte: acte,
          label: acteInfo.acteData.label,
          categorie: acteInfo.categorie
        },
        suggestion_prochain_rdv: null
      });
    }

    res.json({
      message: 'Suggestion de prochain rendez-vous',
      acte_actuel: {
        acte: acte,
        label: acteInfo.acteData.label,
        categorie: acteInfo.categorie
      },
      suggestion_prochain_rdv: suggestion
    });
  } catch (e) {
    console.error('[agenda] suggestion-suite:', e.message);
    res.status(500).json({ error: 'Erreur calcul suggestion' });
  }
});

// =========================================================
// POST /seed — Générer des rendez-vous de test réalistes
// 20-30 RDV sur la semaine courante, actes variés de toutes
// les catégories, séquences liées, planning réaliste
// =========================================================
router.post('/seed', async (req, res) => {
  try {
    if (!req.cabinet) req.cabinet = { id: (req.societe && req.societe.id) || 'default', nom: 'Precision Dentaire' };
    await detectMode(req.cabinet.id);

    // Prénoms et noms — démographie Roubaix (français + nord-africain)
    const prenoms = [
      'Marie', 'Jean', 'Pierre', 'Sophie', 'Thomas', 'Camille', 'Nicolas', 'Julie',
      'François', 'Isabelle', 'Laurent', 'Nathalie', 'Philippe', 'Céline', 'Stéphane',
      'Valérie', 'Patrick', 'Sandrine', 'Christophe', 'Aurélie',
      'Karim', 'Fatima', 'Mohamed', 'Amina', 'Youssef', 'Rachida', 'Ahmed', 'Leïla',
      'Mehdi', 'Samira', 'Nadia', 'Omar', 'Yasmine', 'Bilal', 'Kenza', 'Sofiane',
      'Malika', 'Abdel', 'Soraya', 'Amine'
    ];
    const noms = [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
      'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David',
      'Bertrand', 'Roux', 'Vincent', 'Fournier',
      'Benali', 'Bouzid', 'Khelifi', 'Amrani', 'Hadj', 'Mansouri', 'Belkacem', 'Djelloul',
      'Hamidi', 'Boudjema', 'Ziani', 'Mebarki', 'Slimani', 'Benmoussa', 'Rahmani'
    ];

    // Actes pondérés pour un planning réaliste de cabinet omnipratique
    // Matin : actes longs (endo, chirurgie, prothèse)
    // Après-midi : contrôles, détartrages, soins courts
    const actesMatin = [
      { categorie: 'endodontie', acte: 'endo_mono', poids: 3 },
      { categorie: 'endodontie', acte: 'endo_premolaire', poids: 2 },
      { categorie: 'endodontie', acte: 'endo_molaire', poids: 1 },
      { categorie: 'chirurgie', acte: 'extraction_simple', poids: 3 },
      { categorie: 'chirurgie', acte: 'extraction_complexe', poids: 2 },
      { categorie: 'chirurgie', acte: 'extraction_dds', poids: 1 },
      { categorie: 'chirurgie', acte: 'implant_pose', poids: 1 },
      { categorie: 'prothese_conjointe', acte: 'couronne_empreinte', poids: 3 },
      { categorie: 'prothese_conjointe', acte: 'bridge_empreinte', poids: 2 },
      { categorie: 'prothese_adjointe', acte: 'pap_empreinte_secondaire', poids: 1 },
      { categorie: 'parodontologie', acte: 'surfacage_1secteur', poids: 2 },
      { categorie: 'parodontologie', acte: 'surfacage_2secteurs', poids: 1 },
      { categorie: 'consultation', acte: 'premiere_consultation', poids: 2 },
      { categorie: 'consultation', acte: 'bilan_parodontal', poids: 1 },
      { categorie: 'conservateur', acte: 'soin_carie_2faces', poids: 3 },
      { categorie: 'conservateur', acte: 'soin_carie_3faces', poids: 2 },
      { categorie: 'conservateur', acte: 'coiffage_pulpaire', poids: 1 }
    ];

    const actesApresMidi = [
      { categorie: 'consultation', acte: 'consultation_controle', poids: 5 },
      { categorie: 'consultation', acte: 'consultation_devis', poids: 3 },
      { categorie: 'consultation', acte: 'consultation_urgence', poids: 2 },
      { categorie: 'parodontologie', acte: 'detartrage', poids: 5 },
      { categorie: 'parodontologie', acte: 'maintenance_paro', poids: 2 },
      { categorie: 'conservateur', acte: 'soin_carie_1face', poids: 4 },
      { categorie: 'conservateur', acte: 'soin_carie_2faces', poids: 3 },
      { categorie: 'conservateur', acte: 'scellement_sillon', poids: 2 },
      { categorie: 'prothese_conjointe', acte: 'couronne_pose', poids: 3 },
      { categorie: 'prothese_conjointe', acte: 'descellement_recollage', poids: 2 },
      { categorie: 'prothese_adjointe', acte: 'pap_livraison', poids: 1 },
      { categorie: 'prothese_adjointe', acte: 'pap_doleance_1', poids: 1 },
      { categorie: 'prothese_adjointe', acte: 'reparation_prothese', poids: 1 },
      { categorie: 'orthodontie', acte: 'ajustement_arc', poids: 3 },
      { categorie: 'orthodontie', acte: 'controle_aligneurs', poids: 2 },
      { categorie: 'pedodontie', acte: 'examen_enfant', poids: 3 },
      { categorie: 'pedodontie', acte: 'soin_dent_lait', poids: 2 },
      { categorie: 'pedodontie', acte: 'application_fluor', poids: 2 },
      { categorie: 'esthetique', acte: 'blanchiment_livraison', poids: 1 },
      { categorie: 'esthetique', acte: 'composite_esthetique', poids: 1 }
    ];

    // Construire tableaux pondérés
    function buildWeighted(arr) {
      const result = [];
      for (const item of arr) {
        for (let i = 0; i < item.poids; i++) result.push(item);
      }
      return result;
    }
    const matinWeighted = buildWeighted(actesMatin);
    const apremWeighted = buildWeighted(actesApresMidi);

    function pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    // Générer 4 semaines de RDV à partir du prochain lundi
    const aujourdhui = new Date();
    const prochainLundi = new Date(aujourdhui);
    const dayOfWeek = prochainLundi.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    prochainLundi.setDate(prochainLundi.getDate() + daysUntilMonday);
    prochainLundi.setHours(0, 0, 0, 0);

    const rdvList = [];
    const NB_SEMAINES = 4;

    for (let semaine = 0; semaine < NB_SEMAINES; semaine++) {
      for (let jourOffset = 0; jourOffset < 6; jourOffset++) {
        const isSamedi = jourOffset === 5;
        const jour = new Date(prochainLundi);
        jour.setDate(prochainLundi.getDate() + (semaine * 7) + jourOffset);

        // Dimanche = skip
        if (jour.getDay() === 0) continue;

      // Planification séquentielle SANS chevauchement
      // Matin : 8h00-12h30, pause déjeuner, après-midi : 14h00-19h00
      const plages = isSamedi
        ? [{ debut: 9 * 60, fin: 13 * 60 }]
        : [{ debut: 9 * 60, fin: 12 * 60 + 30 }, { debut: 14 * 60, fin: 20 * 60 }];

      for (const plage of plages) {
        let heureCourante = plage.debut;
        const actePool = heureCourante < 13 * 60 ? matinWeighted : apremWeighted;

        while (heureCourante + 10 <= plage.fin) {
          const acteChoisi = pickRandom(actePool);
          const catData = CATALOGUE_ACTES[acteChoisi.categorie];
          const acteData = catData.actes[acteChoisi.acte];

          // Vérifier qu'il reste assez de temps pour cet acte
          if (heureCourante + acteData.duree > plage.fin) break;

        // Arrondir aux 5 min supérieures, jamais en arrière
        const roundedMin = Math.ceil(heureCourante / 5) * 5;
        heureCourante = roundedMin;
        const h = Math.floor(roundedMin / 60);
        const m = roundedMin % 60;

        const dateRdv = new Date(jour);
        dateRdv.setUTCHours(h - 2, m, 0, 0); // UTC-2 pour affichage Europe/Paris (CEST)

        const prenom = pickRandom(prenoms);
        const nom = pickRandom(noms);
        const tel = '06 ' + String(Math.floor(10000000 + Math.random() * 90000000)).replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
        const emailDomains = ['gmail.com', 'orange.fr', 'hotmail.fr', 'yahoo.fr', 'outlook.fr', 'free.fr'];
        const email = (prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '.' + nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@' + pickRandom(emailDomains)).replace(/\s/g, '');

        rdvList.push({
          cabinet_id: req.cabinet.id,
          patient_nom: nom,
          patient_prenom: prenom,
          patient_tel: tel,
          patient_email: email,
          date_heure: dateRdv.toISOString(),
          duree_minutes: acteData.duree,
          categorie: acteChoisi.categorie,
          acte: acteChoisi.acte,
          type: acteChoisi.categorie,
          notes: acteData.notes,
          couleur: catData.couleur,
          created_at: new Date().toISOString()
        });

          // Avancer de la durée de l'acte + 5 min de battement
          heureCourante += acteData.duree + 5;
        }
      }
      } // fin boucle jours
    } // fin boucle semaines

    // --- Séquence liée réaliste (couronne empreinte → pose 8j plus tard) ---
    const patientSeq1Prenom = pickRandom(prenoms);
    const patientSeq1Nom = pickRandom(noms);
    if (rdvList.length > 0) {
      const catCouronne = CATALOGUE_ACTES.prothese_conjointe;
      Object.assign(rdvList[0], {
        patient_nom: patientSeq1Nom,
        patient_prenom: patientSeq1Prenom,
        duree_minutes: catCouronne.actes.couronne_empreinte.duree,
        categorie: 'prothese_conjointe',
        acte: 'couronne_empreinte',
        type: 'prothese_conjointe',
        notes: 'Couronne 46 — SÉQUENCE : pose prévue semaine prochaine',
        couleur: catCouronne.couleur
      });

      const semaineSuivante = new Date(prochainLundi);
      semaineSuivante.setDate(prochainLundi.getDate() + 9);
      semaineSuivante.setUTCHours(10 - 2, 0, 0, 0);
      rdvList.push({
        cabinet_id: req.cabinet.id,
        patient_nom: patientSeq1Nom,
        patient_prenom: patientSeq1Prenom,
        date_heure: semaineSuivante.toISOString(),
        duree_minutes: catCouronne.actes.couronne_pose.duree,
        categorie: 'prothese_conjointe',
        acte: 'couronne_pose',
        type: 'prothese_conjointe',
        notes: 'Couronne 46 — SÉQUENCE : suite empreinte du ' + toDateStr(prochainLundi),
        couleur: catCouronne.couleur,
        created_at: new Date().toISOString()
      });
    }

    // Séquence PAP (empreinte mardi → essayage semaine +2)
    const mardiDate = new Date(prochainLundi);
    mardiDate.setDate(prochainLundi.getDate() + 1);
    mardiDate.setUTCHours(10 - 2, 30, 0, 0);

    const patientSeq2Prenom = pickRandom(prenoms);
    const patientSeq2Nom = pickRandom(noms);

    rdvList.push({
      cabinet_id: req.cabinet.id,
      patient_nom: patientSeq2Nom,
      patient_prenom: patientSeq2Prenom,
      date_heure: mardiDate.toISOString(),
      duree_minutes: CATALOGUE_ACTES.prothese_adjointe.actes.pap_empreinte_secondaire.duree,
      categorie: 'prothese_adjointe',
      acte: 'pap_empreinte_secondaire',
      type: 'prothese_adjointe',
      notes: 'PAP maxillaire — SÉQUENCE : essayage dans 10 jours',
      couleur: CATALOGUE_ACTES.prothese_adjointe.couleur,
      created_at: new Date().toISOString()
    });

    // Trier par date/heure
    rdvList.sort((a, b) => a.date_heure.localeCompare(b.date_heure));

    // Compter les catégories pour le résumé
    const statsCategories = {};
    for (const rdv of rdvList) {
      statsCategories[rdv.categorie] = (statsCategories[rdv.categorie] || 0) + 1;
    }

    if (useMemory) {
      // Supprimer les anciens RDV de ce cabinet
      memoryStore = memoryStore.filter(r => r.cabinet_id !== req.cabinet.id);
      for (const rdv of rdvList) {
        rdv.id = crypto.randomUUID();
        memoryStore.push(rdv);
      }
      return res.status(201).json({
        message: `${rdvList.length} rendez-vous de test générés (mode mémoire)`,
        count: rdvList.length,
        mode: 'memory',
        periode: { debut: toDateStr(prochainLundi), fin: toDateStr(new Date(prochainLundi.getTime() + 27 * 86400000)) },
        categories_utilisees: statsCategories,
        sequences_liees: [
          `Couronne 46 : ${patientSeq1Prenom} ${patientSeq1Nom} (empreinte + pose)`,
          `PAP maxillaire : ${patientSeq2Prenom} ${patientSeq2Nom} (empreinte secondaire)`
        ]
      });
    }

    // Mode Supabase : supprimer les anciens du cabinet puis insérer
    await admin()
      .from('dentiste_pro_agenda')
      .delete()
      .eq('cabinet_id', req.cabinet.id);

    const { data, error } = await admin()
      .from('dentiste_pro_agenda')
      .insert(rdvList)
      .select();

    if (error) throw error;

    res.status(201).json({
      message: `${(data || []).length} rendez-vous de test générés`,
      count: (data || []).length,
      mode: 'supabase',
      periode: { debut: toDateStr(prochainLundi), fin: toDateStr(new Date(prochainLundi.getTime() + 27 * 86400000)) },
      categories_utilisees: statsCategories,
      sequences_liees: [
        `Couronne 46 : ${patientSeq1Prenom} ${patientSeq1Nom} (empreinte + pose)`,
        `PAP maxillaire : ${patientSeq2Prenom} ${patientSeq2Nom} (empreinte secondaire)`
      ]
    });
  } catch (e) {
    console.error('[agenda] seed:', e.message);
    res.status(500).json({ error: 'Erreur génération des rendez-vous de test' });
  }
});

// =========================================================
// POST /seed-chaos — Planning NON OPTIMISÉ réaliste
// Trous, actes lourds mal placés, pas de regroupement, overbooking
// =========================================================
router.post('/seed-chaos', async (req, res) => {
  try {
    var cabinetId = (req.cabinet && req.cabinet.id) || (req.societe && req.societe.id) || 'test';
    if (!req.cabinet) req.cabinet = { id: cabinetId, nom: 'Mode Test' };
    await detectMode(cabinetId);

    const prenoms = ['Marie','Jean','Pierre','Sophie','Thomas','Camille','Nicolas','Julie','François','Isabelle','Laurent','Nathalie','Karim','Fatima','Mohamed','Amina','Youssef','Rachida','Ahmed','Leïla','Mehdi','Samira','Omar','Kenza','Bilal','Nadia','Amine','Malika','Sofiane','Salima'];
    const noms = ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','Benali','Bouzid','Khelifi','Amrani','Hadj','Mansouri','Ziani','Mebarki','Hamidi','Benmoussa'];
    const emailDomains = ['gmail.com','orange.fr','hotmail.fr','yahoo.fr','outlook.fr','free.fr'];
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function genTel() { return '06 ' + String(Math.floor(10000000 + Math.random() * 90000000)).replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4'); }
    function genEmail(p, n) { return (p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') + '.' + n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') + '@' + pick(emailDomains)).replace(/\s/g,''); }

    // Actes chaotiques — mélanges volontairement mauvais
    const actesLourds = [
      { cat: 'endodontie', acte: 'endo_molaire', duree: 90 },
      { cat: 'endodontie', acte: 'retraitement_endo', duree: 90 },
      { cat: 'chirurgie', acte: 'extraction_dds', duree: 45 },
      { cat: 'chirurgie', acte: 'implant_pose', duree: 60 },
      { cat: 'parodontologie', acte: 'surfacage_2secteurs', duree: 90 },
      { cat: 'prothese_conjointe', acte: 'bridge_complexe_empreinte', duree: 90 },
      { cat: 'esthetique', acte: 'blanchiment_fauteuil', duree: 90 }
    ];
    const actesLegers = [
      { cat: 'consultation', acte: 'consultation_controle', duree: 15 },
      { cat: 'consultation', acte: 'consultation_devis', duree: 20 },
      { cat: 'conservateur', acte: 'soin_carie_1face', duree: 20 },
      { cat: 'parodontologie', acte: 'detartrage', duree: 30 },
      { cat: 'orthodontie', acte: 'controle_aligneurs', duree: 15 },
      { cat: 'pedodontie', acte: 'examen_enfant', duree: 20 },
      { cat: 'prothese_adjointe', acte: 'pap_doleance_1', duree: 20 },
      { cat: 'prothese_conjointe', acte: 'descellement_recollage', duree: 20 }
    ];

    const nbSemaines = parseInt(req.body.semaines) || 12; // 3 mois par défaut
    const inclureSamedi = req.body.samedi !== false;

    const aujourdhui = new Date();
    const prochainLundi = new Date(aujourdhui);
    const dow = prochainLundi.getDay();
    prochainLundi.setDate(prochainLundi.getDate() + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow));
    prochainLundi.setHours(0, 0, 0, 0);

    const rdvList = [];

    for (let semaine = 0; semaine < nbSemaines; semaine++) {
      for (let jourOffset = 0; jourOffset < (inclureSamedi ? 6 : 5); jourOffset++) {
        const isSamedi = jourOffset === 5;
        const jour = new Date(prochainLundi);
        jour.setDate(prochainLundi.getDate() + (semaine * 7) + jourOffset);
        if (jour.getDay() === 0) continue;

        // === CHAOS : planning BLINDÉ comme un vrai cabinet surchargé ===
        const slots = [];
        const allActes = [...actesLourds, ...actesLegers, ...actesLegers, ...actesLegers]; // Plus de légers

        if (!isSamedi) {
          // MATIN BLINDÉ 9h-12h30 — aucun trou
          slots.push({ h: 9, m: 0, ...pick(actesLourds) });    // 90 min endo/chir dès le début
          slots.push({ h: 9, m: 15, ...pick(actesLegers) });   // Double booking classique
          slots.push({ h: 10, m: 0, ...pick(actesLegers) });
          slots.push({ h: 10, m: 20, ...pick(actesLegers) });
          slots.push({ h: 10, m: 40, ...pick(actesLegers) });
          slots.push({ h: 11, m: 0, ...pick(actesLourds) });   // 2ème acte lourd consécutif
          slots.push({ h: 11, m: 15, ...pick(actesLegers) });  // Double booking
          slots.push({ h: 11, m: 45, ...pick(actesLegers) });
          slots.push({ h: 12, m: 0, ...pick(actesLegers) });
          slots.push({ h: 12, m: 15, ...pick(actesLegers) });
          // Quasi pas de pause midi
          if (Math.random() < 0.6) {
            slots.push({ h: 12, m: 30, ...pick(actesLegers) });
            slots.push({ h: 12, m: 45, ...pick(actesLegers) });
            slots.push({ h: 13, m: 0, ...pick(actesLegers) });
            slots.push({ h: 13, m: 30, ...pick(actesLegers) });
          }
          // APRÈS-MIDI BLINDÉ 14h-20h
          slots.push({ h: 14, m: 0, ...pick(actesLegers) });
          slots.push({ h: 14, m: 15, ...pick(actesLegers) });
          slots.push({ h: 14, m: 30, ...pick(actesLegers) });
          slots.push({ h: 14, m: 45, ...pick(actesLegers) });
          slots.push({ h: 15, m: 0, ...pick(actesLourds) });   // Acte lourd 90 min
          slots.push({ h: 15, m: 15, ...pick(actesLegers) });  // Double booking
          slots.push({ h: 16, m: 0, ...pick(actesLegers) });
          slots.push({ h: 16, m: 15, ...pick(actesLegers) });
          slots.push({ h: 16, m: 30, ...pick(actesLegers) });
          slots.push({ h: 16, m: 45, ...pick(actesLegers) });
          slots.push({ h: 17, m: 0, ...pick(actesLegers) });
          slots.push({ h: 17, m: 15, ...pick(actesLegers) });
          slots.push({ h: 17, m: 30, ...pick(actesLegers) });
          slots.push({ h: 17, m: 45, ...pick(actesLegers) });
          slots.push({ h: 18, m: 0, ...pick(actesLourds) });   // Endo/chir à 18h = burnout
          slots.push({ h: 18, m: 15, ...pick(actesLegers) });  // Double booking
          slots.push({ h: 18, m: 30, ...pick(actesLegers) });
          slots.push({ h: 19, m: 0, ...pick(actesLegers) });
          slots.push({ h: 19, m: 15, ...pick(actesLegers) });
          slots.push({ h: 19, m: 30, ...pick(actesLegers) });
          // Urgences non planifiées en plus
          if (Math.random() < 0.5) {
            slots.push({ h: 10, m: 30, cat: 'chirurgie', acte: 'extraction_simple', duree: 20 });
            slots.push({ h: 16, m: 0, cat: 'consultation', acte: 'consultation_urgence', duree: 20 });
          }
        } else {
          // Samedi matin blindé aussi
          slots.push({ h: 9, m: 0, ...pick(actesLegers) });
          slots.push({ h: 9, m: 15, ...pick(actesLegers) });
          slots.push({ h: 9, m: 30, ...pick(actesLegers) });
          slots.push({ h: 9, m: 45, ...pick(actesLegers) });
          slots.push({ h: 10, m: 0, ...pick(actesLegers) });
          slots.push({ h: 10, m: 15, ...pick(actesLegers) });
          slots.push({ h: 10, m: 30, ...pick(actesLegers) });
          slots.push({ h: 10, m: 45, ...pick(actesLegers) });
          slots.push({ h: 11, m: 0, ...pick(actesLegers) });
          slots.push({ h: 11, m: 15, ...pick(actesLegers) });
          slots.push({ h: 11, m: 30, ...pick(actesLegers) });
          slots.push({ h: 12, m: 0, ...pick(actesLegers) });
        }

        for (const slot of slots) {
          const p = pick(prenoms);
          const n = pick(noms);
          const catData = CATALOGUE_ACTES[slot.cat];
          if (!catData) continue;
          const acteData = catData.actes[slot.acte];
          if (!acteData) continue;

          const dateRdv = new Date(jour);
          dateRdv.setUTCHours(slot.h - 2, slot.m, 0, 0);

          rdvList.push({
            cabinet_id: req.cabinet.id,
            patient_nom: n,
            patient_prenom: p,
            patient_tel: genTel(),
            patient_email: genEmail(p, n),
            date_heure: dateRdv.toISOString(),
            duree_minutes: slot.duree,
            categorie: slot.cat,
            acte: slot.acte,
            type: slot.cat,
            notes: acteData.notes,
            couleur: catData.couleur,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    rdvList.sort((a, b) => a.date_heure.localeCompare(b.date_heure));

    // Sauvegarder en memoryStore
    memoryStore = memoryStore.filter(r => r.cabinet_id !== req.cabinet.id);
    for (const rdv of rdvList) {
      rdv.id = crypto.randomUUID();
      memoryStore.push(rdv);
    }

    // Aussi sauvegarder en Supabase si table détectée
    let savedMode = 'memory';
    try {
      const db = admin();
      // Supprimer les anciens RDV chaos de ce cabinet
      try { await db.from('dentiste_pro_agenda').delete().eq('cabinet_id', cabinetId); } catch {}
      // Insérer par batch de 200
      for (let i = 0; i < rdvList.length; i += 200) {
        const batch = rdvList.slice(i, i + 200).map(r => ({ ...r, notes: (r.notes || '') + ' [chaos]' }));
        const { error: insErr } = await db.from('dentiste_pro_agenda').insert(batch);
        if (insErr) { console.warn('[seed-chaos] insert batch error:', insErr.message); break; }
      }
      savedMode = 'supabase';
    } catch (e) {
      console.warn('[agenda] seed-chaos supabase save failed:', e.message);
    }

    res.status(201).json({
      message: `${rdvList.length} RDV CHAOS générés — planning non optimisé`,
      count: rdvList.length,
      mode: savedMode,
      problemes: [
        'Actes lourds consécutifs (2 endos le matin)',
        'Trous inexpliqués de 30-45 min',
        'Débordement sur la pause déjeuner',
        'Actes lourds en fin de journée',
        'Double-booking (urgences non planifiées)',
        'Contrôle 15 min entre 2 actes de 90 min',
        'Pas de regroupement par type d\'acte'
      ]
    });
  } catch (e) {
    console.error('[agenda] seed-chaos:', e.message);
    res.status(500).json({ error: 'Erreur génération planning chaos' });
  }
});

// =========================================================
// GET /track/:id/pixel.png — Pixel tracking email lu
// =========================================================
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

router.get('/track/:id/pixel.png', async (req, res) => {
  try {
    const trackingId = req.params.id;
    if (useMemory) {
      const rdv = memoryStore.find(r => r.email_tracking_id === trackingId);
      if (rdv && !rdv.email_opened) {
        rdv.email_opened = true;
        rdv.email_opened_at = new Date().toISOString();
      }
    } else {
      await admin().from('dentiste_pro_agenda')
        .update({ email_opened: true, email_opened_at: new Date().toISOString() })
        .eq('email_tracking_id', trackingId);
    }
    console.log(`[agenda] Email ouvert (tracking: ${trackingId})`);
  } catch (_) {}
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.end(PIXEL_PNG);
});

// =========================================================
// GET /confirm/:id — Patient confirme sa présence
// =========================================================
router.get('/confirm/:id', async (req, res) => {
  try {
    const trackingId = req.params.id;
    if (useMemory) {
      const rdv = memoryStore.find(r => r.email_tracking_id === trackingId);
      if (rdv) {
        rdv.email_opened = true;
        rdv.email_confirmed = true;
        rdv.email_confirmed_at = new Date().toISOString();
      }
    } else {
      await admin().from('dentiste_pro_agenda')
        .update({ email_opened: true, email_confirmed: true, email_confirmed_at: new Date().toISOString() })
        .eq('email_tracking_id', trackingId);
    }
    console.log(`[agenda] Patient confirmé (tracking: ${trackingId})`);
  } catch (_) {}
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmé — JADOMI</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f0fdfa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px"><div style="background:#fff;border-radius:20px;padding:48px 32px;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)"><div style="font-size:48px;margin-bottom:16px">&#9989;</div><h1 style="font-size:22px;color:#0f766e;margin-bottom:12px">Présence confirmée</h1><p style="color:#666;font-size:15px;line-height:1.6">Merci ! Votre praticien est averti de votre venue.</p><p style="color:#999;font-size:12px;margin-top:24px">JADOMI</p></div></body></html>`);
});

// =========================================================
// POST /checkin — Check-in patient depuis QR code salle d'attente
// Body : patient_nom, date_naissance, cabinet_id
// Pas d'auth requis (page publique)
// Rate limited par IP (voir server.js)
// =========================================================
router.post('/checkin', async (req, res) => {
  try {
    const { patient_nom, date_naissance, cabinet_id } = req.body || {};

    if (!patient_nom) {
      return res.status(400).json({ success: false, error: 'Veuillez indiquer votre nom' });
    }

    const nomNorm = patient_nom.trim().toLowerCase();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Chercher dans le store (memory ou Supabase)
    let rdvList = [];

    if (useMemory) {
      rdvList = memoryStore.filter(r => {
        const rDate = r.date_heure ? r.date_heure.slice(0, 10) : '';
        const rNom = (r.patient_nom || '').toLowerCase();
        return rDate === todayStr && rNom.includes(nomNorm);
      });
    } else {
      const cabId = cabinet_id || 'default';
      const debutJour = todayStr + 'T00:00:00';
      const finJour = todayStr + 'T23:59:59';

      const { data, error } = await admin()
        .from('dentiste_pro_agenda')
        .select('*')
        .eq('cabinet_id', cabId)
        .gte('date_heure', debutJour)
        .lte('date_heure', finJour)
        .ilike('patient_nom', '%' + nomNorm + '%');

      if (!error && data) rdvList = data;
    }

    if (rdvList.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Aucun rendez-vous trouvé à votre nom aujourd\'hui'
      });
    }

    // Prendre le prochain RDV non terminé
    const rdv = rdvList.find(r => r.statut !== 'termine' && r.statut !== 'absent') || rdvList[0];
    const now = new Date().toISOString();

    // Mettre à jour le statut
    if (useMemory) {
      const idx = memoryStore.findIndex(r => r.id === rdv.id);
      if (idx >= 0) {
        memoryStore[idx].statut = 'arrive';
        memoryStore[idx].heure_arrivee = now;
      }
    } else {
      await admin()
        .from('dentiste_pro_agenda')
        .update({ statut: 'arrive', heure_arrivee: now })
        .eq('id', rdv.id);
    }

    // Formater l'heure du RDV pour le patient
    const heureRdv = rdv.date_heure ? new Date(rdv.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;

    console.log(`[agenda] Check-in: ${rdv.patient_nom} arrivé via QR code`);

    res.json({
      success: true,
      message: 'Votre arrivée a été enregistrée. Votre praticien est averti.',
      heure_rdv: heureRdv,
      patient: rdv.patient_nom + (rdv.patient_prenom ? ' ' + rdv.patient_prenom : '')
    });
  } catch (e) {
    console.error('[agenda] checkin:', e.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /qrcode — Générer les infos pour le QR code salle d'attente
// =========================================================
router.get('/qrcode', (req, res) => {
  const cabinetId = req.cabinet ? req.cabinet.id : 'default';
  const cabinetName = req.cabinet ? req.cabinet.nom : 'Cabinet';
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const checkinUrl = `${baseUrl}/agenda/checkin.html?cabinet=${encodeURIComponent(cabinetId)}&name=${encodeURIComponent(cabinetName)}`;

  res.json({
    url: checkinUrl,
    cabinet_id: cabinetId,
    cabinet_name: cabinetName,
    instructions: 'Affichez ce QR code en salle d\'attente. Les patients le scannent pour signaler leur arrivée.'
  });
});

module.exports = router;
