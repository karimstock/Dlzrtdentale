// =============================================
// JADOMI LABO — Donnees template catalogue (JS)
// Utilise en fallback si rpc exec_sql indisponible
// =============================================

module.exports = [
  // AMOVIBLE RESINE
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 1 dent', prix_unitaire: 45, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 1 },
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 2 dents', prix_unitaire: 55, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 2 },
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 3 dents', prix_unitaire: 65, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 3 },
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 4-6 dents', prix_unitaire: 80, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 4 },
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 7-10 dents', prix_unitaire: 100, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 5 },
  { categorie: 'amovible', sous_categorie: 'transitoire', nom: 'Transitoire 11-14 dents', prix_unitaire: 120, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 6 },
  { categorie: 'amovible', sous_categorie: 'resine_rose', nom: 'Resine Rose 1 dent', prix_unitaire: 55, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 10 },
  { categorie: 'amovible', sous_categorie: 'resine_rose', nom: 'Resine Rose complete', prix_unitaire: 180, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 13 },
  { categorie: 'amovible', sous_categorie: 'resine_veinee', nom: 'Resine Veinee 1 dent', prix_unitaire: 65, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 20 },
  { categorie: 'amovible', sous_categorie: 'resine_veinee', nom: 'Resine Veinee complete', prix_unitaire: 200, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 23 },
  { categorie: 'amovible', sous_categorie: 'lucitone', nom: 'Lucitone 1 dent', prix_unitaire: 75, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 30 },
  { categorie: 'amovible', sous_categorie: 'lucitone', nom: 'Lucitone complete', prix_unitaire: 220, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, source_ajout: 'template_jadomi', ordre_affichage: 33 },
  // FIXE CERAMIQUE
  { categorie: 'fixe_ceramique', sous_categorie: 'ceramo_metal', nom: 'Couronne ceramo-metal', prix_unitaire: 110, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 60 },
  { categorie: 'fixe_ceramique', sous_categorie: 'zircone', nom: 'Zircone usinee', prix_unitaire: 140, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 65 },
  { categorie: 'fixe_ceramique', sous_categorie: 'emax', nom: 'Emax usinee', prix_unitaire: 130, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 68 },
  { categorie: 'fixe_ceramique', sous_categorie: 'emax', nom: 'Facette Emax', prix_unitaire: 120, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 72 },
  // FIXE METAL
  { categorie: 'fixe_metal', sous_categorie: 'couronne', nom: 'Couronne coulee', prix_unitaire: 80, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', code_ccam: 'HBLD038', necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 50 },
  { categorie: 'fixe_metal', sous_categorie: 'complement', nom: 'Inlay core', prix_unitaire: 60, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 57 },
  // IMPLANT
  { categorie: 'implant', sous_categorie: 'couronne', nom: 'CCM sur implant', prix_unitaire: 140, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 80 },
  { categorie: 'implant', sous_categorie: 'transvissee', nom: 'Transvissee Zr sur Tibase', prix_unitaire: 180, tva_applicable: false, taux_tva: 0, type_produit: 'prothese', necessite_teinte: true, necessite_materiau: true, source_ajout: 'template_jadomi', ordre_affichage: 84 },
  // REPARATION
  { categorie: 'reparation', sous_categorie: 'reparation', nom: 'Cassure simple', prix_unitaire: 35, tva_applicable: false, taux_tva: 0, type_produit: 'reparation', code_ccam: 'HBMD020', source_ajout: 'template_jadomi', ordre_affichage: 100 },
  { categorie: 'reparation', sous_categorie: 'rebasage', nom: 'Rebasage froid', prix_unitaire: 50, tva_applicable: false, taux_tva: 0, type_produit: 'reparation', code_ccam: 'HBMD004', source_ajout: 'template_jadomi', ordre_affichage: 103 },
  // ORTHESE (TVA 20%)
  { categorie: 'orthese', sous_categorie: 'gouttiere', nom: 'Gouttiere blanchiment', prix_unitaire: 45, tva_applicable: true, taux_tva: 20, type_produit: 'orthese', source_ajout: 'template_jadomi', ordre_affichage: 120 },
  { categorie: 'orthese', sous_categorie: 'gouttiere', nom: 'Gouttiere occlusale', prix_unitaire: 80, tva_applicable: true, taux_tva: 20, type_produit: 'orthese', source_ajout: 'template_jadomi', ordre_affichage: 122 },
  { categorie: 'orthese', sous_categorie: 'guide', nom: 'Guide chirurgical', prix_unitaire: 150, tva_applicable: true, taux_tva: 20, type_produit: 'orthese', source_ajout: 'template_jadomi', ordre_affichage: 125 },
  // ODF (TVA 20%)
  { categorie: 'odf', sous_categorie: 'odf', nom: 'Appareillage ODF complet', prix_unitaire: 150, tva_applicable: true, taux_tva: 20, type_produit: 'orthese', source_ajout: 'template_jadomi', ordre_affichage: 137 },
  // ACCESSOIRE
  { categorie: 'accessoire', sous_categorie: 'accessoire', nom: 'PEI (porte-empreinte individuel)', prix_unitaire: 30, tva_applicable: false, taux_tva: 0, type_produit: 'accessoire', source_ajout: 'template_jadomi', ordre_affichage: 110 },
];
