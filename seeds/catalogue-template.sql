-- =============================================
-- JADOMI LABO — Template catalogue standard
-- A executer avec un prothesiste_id specifique
-- Usage : remplacer '__PROTHESISTE_ID__' par l'UUID reel
-- =============================================

-- === PROTHESE AMOVIBLE RESINE (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_teinte, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 1 dent', 45, false, 0, 'prothese', true, 'template_jadomi', 1),
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 2 dents', 55, false, 0, 'prothese', true, 'template_jadomi', 2),
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 3 dents', 65, false, 0, 'prothese', true, 'template_jadomi', 3),
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 4-6 dents', 80, false, 0, 'prothese', true, 'template_jadomi', 4),
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 7-10 dents', 100, false, 0, 'prothese', true, 'template_jadomi', 5),
('__PROTHESISTE_ID__', 'amovible', 'transitoire', 'Transitoire 11-14 dents', 120, false, 0, 'prothese', true, 'template_jadomi', 6),
('__PROTHESISTE_ID__', 'amovible', 'resine_rose', 'Resine Rose 1 dent', 55, false, 0, 'prothese', true, 'template_jadomi', 10),
('__PROTHESISTE_ID__', 'amovible', 'resine_rose', 'Resine Rose 2 dents', 65, false, 0, 'prothese', true, 'template_jadomi', 11),
('__PROTHESISTE_ID__', 'amovible', 'resine_rose', 'Resine Rose 3 dents', 75, false, 0, 'prothese', true, 'template_jadomi', 12),
('__PROTHESISTE_ID__', 'amovible', 'resine_rose', 'Resine Rose complete', 180, false, 0, 'prothese', true, 'template_jadomi', 13),
('__PROTHESISTE_ID__', 'amovible', 'resine_veinee', 'Resine Veinee 1 dent', 65, false, 0, 'prothese', true, 'template_jadomi', 20),
('__PROTHESISTE_ID__', 'amovible', 'resine_veinee', 'Resine Veinee 2 dents', 75, false, 0, 'prothese', true, 'template_jadomi', 21),
('__PROTHESISTE_ID__', 'amovible', 'resine_veinee', 'Resine Veinee 3 dents', 85, false, 0, 'prothese', true, 'template_jadomi', 22),
('__PROTHESISTE_ID__', 'amovible', 'resine_veinee', 'Resine Veinee complete', 200, false, 0, 'prothese', true, 'template_jadomi', 23),
('__PROTHESISTE_ID__', 'amovible', 'lucitone', 'Lucitone 1 dent', 75, false, 0, 'prothese', true, 'template_jadomi', 30),
('__PROTHESISTE_ID__', 'amovible', 'lucitone', 'Lucitone 2 dents', 85, false, 0, 'prothese', true, 'template_jadomi', 31),
('__PROTHESISTE_ID__', 'amovible', 'lucitone', 'Lucitone 3 dents', 95, false, 0, 'prothese', true, 'template_jadomi', 32),
('__PROTHESISTE_ID__', 'amovible', 'lucitone', 'Lucitone complete', 220, false, 0, 'prothese', true, 'template_jadomi', 33);

-- === PROTHESE AMOVIBLE METALLIQUE (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_teinte, necessite_materiau, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'amovible_metallique', 'stellite', 'Stellite 1 dent', 120, false, 0, 'prothese', true, true, 'template_jadomi', 40),
('__PROTHESISTE_ID__', 'amovible_metallique', 'stellite', 'Stellite 2-4 dents', 140, false, 0, 'prothese', true, true, 'template_jadomi', 41),
('__PROTHESISTE_ID__', 'amovible_metallique', 'stellite', 'Stellite 5-8 dents', 165, false, 0, 'prothese', true, true, 'template_jadomi', 42),
('__PROTHESISTE_ID__', 'amovible_metallique', 'stellite', 'Stellite 9-14 dents', 190, false, 0, 'prothese', true, true, 'template_jadomi', 43),
('__PROTHESISTE_ID__', 'amovible_metallique', 'complement', 'Retention soudee', 35, false, 0, 'prothese', false, true, 'template_jadomi', 44),
('__PROTHESISTE_ID__', 'amovible_metallique', 'complement', 'Crochet coule soude', 40, false, 0, 'prothese', false, true, 'template_jadomi', 45),
('__PROTHESISTE_ID__', 'amovible_metallique', 'complement', 'Dent contreplaquee', 50, false, 0, 'prothese', true, true, 'template_jadomi', 46),
('__PROTHESISTE_ID__', 'amovible_metallique', 'complement', 'Dent metal', 45, false, 0, 'prothese', false, true, 'template_jadomi', 47);

-- === PROTHESE FIXE METAL (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, code_ccam, necessite_materiau, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'fixe_metal', 'couronne', 'Couronne coulee', 80, false, 0, 'prothese', 'HBLD038', true, 'template_jadomi', 50),
('__PROTHESISTE_ID__', 'fixe_metal', 'couronne', 'Couronne coulee fraisee', 95, false, 0, 'prothese', 'HBLD007', true, 'template_jadomi', 51),
('__PROTHESISTE_ID__', 'fixe_metal', 'couronne', 'Couronne sur implant metal', 110, false, 0, 'prothese', 'HBLD261', true, 'template_jadomi', 52),
('__PROTHESISTE_ID__', 'fixe_metal', 'couronne', 'Couronne a clavette', 100, false, 0, 'prothese', NULL, true, 'template_jadomi', 53),
('__PROTHESISTE_ID__', 'fixe_metal', 'complement', 'Bridge colle metal', 90, false, 0, 'prothese', NULL, true, 'template_jadomi', 54),
('__PROTHESISTE_ID__', 'fixe_metal', 'complement', 'Onlay metal', 75, false, 0, 'prothese', NULL, true, 'template_jadomi', 55),
('__PROTHESISTE_ID__', 'fixe_metal', 'complement', 'Faux moignon', 55, false, 0, 'prothese', NULL, true, 'template_jadomi', 56),
('__PROTHESISTE_ID__', 'fixe_metal', 'complement', 'Inlay core', 60, false, 0, 'prothese', NULL, true, 'template_jadomi', 57);

-- === PROTHESE FIXE CERAMIQUE (exonere TVA, teinte obligatoire) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_teinte, necessite_materiau, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'fixe_ceramique', 'ceramo_metal', 'Couronne ceramo-metal', 110, false, 0, 'prothese', true, true, 'template_jadomi', 60),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'ceramo_metal', 'CCM monocouche fraisee', 120, false, 0, 'prothese', true, true, 'template_jadomi', 61),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'ceramo_metal', 'CCM joint vif', 130, false, 0, 'prothese', true, true, 'template_jadomi', 62),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'ceramo_metal', 'Bridge ceramo-metal (element)', 110, false, 0, 'prothese', true, true, 'template_jadomi', 63),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'provisoire', 'Provisoire PMMA', 45, false, 0, 'prothese', true, false, 'template_jadomi', 64),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'zircone', 'Zircone usinee', 140, false, 0, 'prothese', true, true, 'template_jadomi', 65),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'zircone', 'Zircone fraisee', 150, false, 0, 'prothese', true, true, 'template_jadomi', 66),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'zircone', 'Ceramique sur zircone', 165, false, 0, 'prothese', true, true, 'template_jadomi', 67),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'emax', 'Emax usinee', 130, false, 0, 'prothese', true, true, 'template_jadomi', 68),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'emax', 'Emax pressee', 140, false, 0, 'prothese', true, true, 'template_jadomi', 69),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'emax', 'Inlay Emax', 100, false, 0, 'prothese', true, true, 'template_jadomi', 70),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'emax', 'Onlay Emax', 110, false, 0, 'prothese', true, true, 'template_jadomi', 71),
('__PROTHESISTE_ID__', 'fixe_ceramique', 'emax', 'Facette Emax', 120, false, 0, 'prothese', true, true, 'template_jadomi', 72);

-- === PROTHESE SUR IMPLANT (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_teinte, necessite_materiau, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'implant', 'couronne', 'CCM sur implant', 140, false, 0, 'prothese', true, true, 'template_jadomi', 80),
('__PROTHESISTE_ID__', 'implant', 'pilier', 'Pilier Atlantis', 120, false, 0, 'prothese', false, true, 'template_jadomi', 81),
('__PROTHESISTE_ID__', 'implant', 'pilier', 'Pilier Nobel', 130, false, 0, 'prothese', false, true, 'template_jadomi', 82),
('__PROTHESISTE_ID__', 'implant', 'pilier', 'Pilier titane standard', 80, false, 0, 'prothese', false, true, 'template_jadomi', 83),
('__PROTHESISTE_ID__', 'implant', 'transvissee', 'Transvissee Zr sur Tibase', 180, false, 0, 'prothese', true, true, 'template_jadomi', 84),
('__PROTHESISTE_ID__', 'implant', 'barre', 'Barre 2-3 implants', 350, false, 0, 'prothese', false, true, 'template_jadomi', 85),
('__PROTHESISTE_ID__', 'implant', 'barre', 'Barre 4-5 implants', 500, false, 0, 'prothese', false, true, 'template_jadomi', 86),
('__PROTHESISTE_ID__', 'implant', 'barre', 'Barre 6+ implants', 650, false, 0, 'prothese', false, true, 'template_jadomi', 87);

-- === ATTACHEMENTS (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_materiau, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'attachement', 'attachement', 'Nobil Metal', 85, false, 0, 'prothese', true, 'template_jadomi', 90),
('__PROTHESISTE_ID__', 'attachement', 'attachement', 'Cavalier Or Ackerman', 95, false, 0, 'prothese', true, 'template_jadomi', 91),
('__PROTHESISTE_ID__', 'attachement', 'attachement', 'Fraisage', 70, false, 0, 'prothese', false, 'template_jadomi', 92),
('__PROTHESISTE_ID__', 'attachement', 'attachement', 'Pose attachement', 40, false, 0, 'prothese', false, 'template_jadomi', 93);

-- === REPARATIONS (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, code_ccam, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'reparation', 'reparation', 'Cassure simple', 35, false, 0, 'reparation', 'HBMD020', 'template_jadomi', 100),
('__PROTHESISTE_ID__', 'reparation', 'reparation', 'Adjonction 1 dent', 35, false, 0, 'reparation', 'HBMD017', 'template_jadomi', 101),
('__PROTHESISTE_ID__', 'reparation', 'reparation', 'Adjonction 2 dents', 50, false, 0, 'reparation', NULL, 'template_jadomi', 102),
('__PROTHESISTE_ID__', 'reparation', 'rebasage', 'Rebasage froid', 50, false, 0, 'reparation', 'HBMD004', 'template_jadomi', 103),
('__PROTHESISTE_ID__', 'reparation', 'rebasage', 'Rebasage chaud', 60, false, 0, 'reparation', NULL, 'template_jadomi', 104),
('__PROTHESISTE_ID__', 'reparation', 'rebasage', 'Rebasage molle', 65, false, 0, 'reparation', NULL, 'template_jadomi', 105),
('__PROTHESISTE_ID__', 'reparation', 'rebasage', 'Rebasage partiel', 45, false, 0, 'reparation', NULL, 'template_jadomi', 106),
('__PROTHESISTE_ID__', 'reparation', 'reparation', 'Soudure laser', 40, false, 0, 'reparation', 'HBMD007', 'template_jadomi', 107),
('__PROTHESISTE_ID__', 'reparation', 'reparation', 'Crochet supplementaire', 30, false, 0, 'reparation', NULL, 'template_jadomi', 108);

-- === ACCESSOIRES AMOVIBLES (exonere TVA) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'accessoire', 'accessoire', 'PEI (porte-empreinte individuel)', 30, false, 0, 'accessoire', 'template_jadomi', 110),
('__PROTHESISTE_ID__', 'accessoire', 'accessoire', 'Cire d''occlusion', 15, false, 0, 'accessoire', 'template_jadomi', 111),
('__PROTHESISTE_ID__', 'accessoire', 'accessoire', 'Crochet supplementaire', 25, false, 0, 'accessoire', 'template_jadomi', 112),
('__PROTHESISTE_ID__', 'accessoire', 'accessoire', 'Valplast / Flexi J', 90, false, 0, 'accessoire', 'template_jadomi', 113);

-- === ORTHESES (TVA 20%) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'orthese', 'gouttiere', 'Gouttiere blanchiment', 45, true, 20, 'orthese', 'template_jadomi', 120),
('__PROTHESISTE_ID__', 'orthese', 'gouttiere', 'Gouttiere fluor', 45, true, 20, 'orthese', 'template_jadomi', 121),
('__PROTHESISTE_ID__', 'orthese', 'gouttiere', 'Gouttiere occlusale', 80, true, 20, 'orthese', 'template_jadomi', 122),
('__PROTHESISTE_ID__', 'orthese', 'gouttiere', 'Protege-dents sportif', 60, true, 20, 'orthese', 'template_jadomi', 123),
('__PROTHESISTE_ID__', 'orthese', 'guide', 'Guide radiologique', 120, true, 20, 'orthese', 'template_jadomi', 124),
('__PROTHESISTE_ID__', 'orthese', 'guide', 'Guide chirurgical', 150, true, 20, 'orthese', 'template_jadomi', 125);

-- === ODF (TVA 20%) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'odf', 'odf', 'Prothese pedodontique', 70, true, 20, 'orthese', 'template_jadomi', 130),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Mainteneur d''espace', 55, true, 20, 'orthese', 'template_jadomi', 131),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Arc orthodontique', 35, true, 20, 'orthese', 'template_jadomi', 132),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Verin', 30, true, 20, 'orthese', 'template_jadomi', 133),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Adams', 25, true, 20, 'orthese', 'template_jadomi', 134),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Propulseur', 90, true, 20, 'orthese', 'template_jadomi', 135),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Positionneur', 80, true, 20, 'orthese', 'template_jadomi', 136),
('__PROTHESISTE_ID__', 'odf', 'odf', 'Appareillage ODF complet', 150, true, 20, 'orthese', 'template_jadomi', 137);

-- === DENTS DU COMMERCE (exonere si integrees) ===
INSERT INTO catalogue_produits (prothesiste_id, categorie, sous_categorie, nom, prix_unitaire, tva_applicable, taux_tva, type_produit, necessite_teinte, source_ajout, ordre_affichage) VALUES
('__PROTHESISTE_ID__', 'dents', 'vita', 'Vita MFT (jeu)', 25, false, 0, 'accessoire', true, 'template_jadomi', 140),
('__PROTHESISTE_ID__', 'dents', 'vita', 'Vita Gnathostar (jeu)', 28, false, 0, 'accessoire', true, 'template_jadomi', 141),
('__PROTHESISTE_ID__', 'dents', 'ivoclar', 'Ivostar (jeu)', 30, false, 0, 'accessoire', true, 'template_jadomi', 142),
('__PROTHESISTE_ID__', 'dents', 'ivoclar', 'Phonares (jeu)', 35, false, 0, 'accessoire', true, 'template_jadomi', 143),
('__PROTHESISTE_ID__', 'dents', 'ivoclar', 'Orthosit (jeu)', 22, false, 0, 'accessoire', true, 'template_jadomi', 144),
('__PROTHESISTE_ID__', 'dents', 'ivoclar', 'Vivoperl (jeu)', 32, false, 0, 'accessoire', true, 'template_jadomi', 145),
('__PROTHESISTE_ID__', 'dents', 'vita', 'Vitapan (jeu)', 26, false, 0, 'accessoire', true, 'template_jadomi', 146);
