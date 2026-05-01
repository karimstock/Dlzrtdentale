-- =============================================
-- SIMULATION TOURNÉES LIVREUR — NORD DE LA FRANCE
-- 160 dentistes (40 par coursier × 4 secteurs)
-- Semaine complète : 5-10 mai 2026
-- 4 coursiers × 2 créneaux × 6 jours = 48 tournées
-- 40 arrêts/jour/coursier (20 matin + 20 après-midi)
-- SCÉNARIO LIVE : Mehdi en route vers Dr Bahmed (test notif)
-- =============================================
-- ⚠️ À EXÉCUTER DANS SUPABASE DASHBOARD (SQL Editor)
-- =============================================

DO $$
DECLARE
  v_prothesiste_id UUID;
  v_societe_id UUID;

  -- 4 coursiers
  v_livreur_ids UUID[] := ARRAY[]::UUID[];
  v_livreur_id UUID;

  -- Dentistes par secteur (4 × 40 = 160)
  v_dentistes_s1 UUID[] := ARRAY[]::UUID[]; -- Nordine : Lille
  v_dentistes_s2 UUID[] := ARRAY[]::UUID[]; -- Mehdi : Roubaix/Tourcoing
  v_dentistes_s3 UUID[] := ARRAY[]::UUID[]; -- Youssef : VDA/Marcq
  v_dentistes_s4 UUID[] := ARRAY[]::UUID[]; -- Antoine : Armentières/Lambersart

  v_dentiste_id UUID;
  v_tournee_id UUID;
  v_demande_id UUID;
  v_jour DATE;
  v_jour_idx INTEGER;
  v_idx INTEGER;
  v_creneau TEXT;
  v_batch UUID[];
  v_statut_tournee TEXT;
  v_statut_arret TEXT;
  v_heure_depart_t TIMESTAMPTZ;
  v_heure_fin_t TIMESTAMPTZ;

  -- Dr Bahmed spécial
  v_bahmed_id UUID;
  v_bahmed_tournee_id UUID;
  v_bahmed_demande_id UUID;
  v_bahmed_arret_id UUID;

  -- Tableaux de données dentistes
  v_noms TEXT[];
  v_prenoms TEXT[];
  v_cabinets TEXT[];
  v_adresses TEXT[];
  v_villes TEXT[];
  v_cps TEXT[];

BEGIN

-- =============================================
-- 0. NETTOYAGE DES DONNÉES DE SIMULATION PRÉCÉDENTES
-- =============================================
SELECT id INTO v_prothesiste_id FROM labo_prothesistes LIMIT 1;

IF v_prothesiste_id IS NOT NULL THEN
  RAISE NOTICE '🧹 Nettoyage simulation précédente...';
  -- Supprimer dans l'ordre inverse des dépendances
  DELETE FROM labo_positions_livreur WHERE livreur_id IN (SELECT id FROM labo_livreurs WHERE prothesiste_id = v_prothesiste_id);
  DELETE FROM labo_notifications_dentiste WHERE prothesiste_id = v_prothesiste_id;
  DELETE FROM labo_arrets_tournee WHERE tournee_id IN (SELECT id FROM labo_tournees_livreur WHERE prothesiste_id = v_prothesiste_id);
  DELETE FROM labo_demandes_passage WHERE prothesiste_id = v_prothesiste_id;
  DELETE FROM labo_tournees_livreur WHERE prothesiste_id = v_prothesiste_id;
  DELETE FROM labo_livreurs WHERE prothesiste_id = v_prothesiste_id;
  DELETE FROM dentistes_clients WHERE prothesiste_id = v_prothesiste_id;
  RAISE NOTICE '✅ Données précédentes nettoyées';
END IF;

-- =============================================
-- 0b. RÉCUPÉRER OU CRÉER LE PROTHÉSISTE
-- =============================================

IF v_prothesiste_id IS NULL THEN
  -- Récupérer le user_id du fondateur (karim_bahmed@yahoo.fr)
  INSERT INTO societes (id, nom, type, owner_id, created_at)
  VALUES (
    gen_random_uuid(), 'Labo Prothèse du Nord', 'profession_liberale',
    (SELECT id FROM auth.users WHERE email = 'karim_bahmed@yahoo.fr' LIMIT 1),
    now()
  )
  RETURNING id INTO v_societe_id;

  INSERT INTO labo_prothesistes (
    societe_id, raison_sociale, forme_juridique, siren,
    adresse_ligne1, code_postal, ville, telephone, email,
    pays_fabrication, responsable_qualite
  ) VALUES (
    v_societe_id, 'Labo Prothèse du Nord SARL', 'SARL', '912345678',
    '15 rue de la Qualité', '59000', 'Lille', '03 20 00 00 01', 'contact@labo-nord.fr',
    'France', 'Jean-Marc DUVAL'
  ) RETURNING id INTO v_prothesiste_id;
END IF;

RAISE NOTICE '✅ Prothésiste ID : %', v_prothesiste_id;

-- =============================================
-- 1. CRÉER LES 4 COURSIERS
-- =============================================
INSERT INTO labo_livreurs (prothesiste_id, nom, prenom, telephone, email, vehicule, zone_rayon_km, couleur, actif, access_token)
VALUES (v_prothesiste_id, 'BENSALEM', 'Nordine', '06 12 34 56 01', 'nordine.b@labo-nord.fr', 'utilitaire', 40, '#6366f1', true, encode(gen_random_bytes(32), 'hex'))
RETURNING id INTO v_livreur_id;
v_livreur_ids := v_livreur_ids || v_livreur_id;

INSERT INTO labo_livreurs (prothesiste_id, nom, prenom, telephone, email, vehicule, zone_rayon_km, couleur, actif, access_token)
VALUES (v_prothesiste_id, 'KADDOURI', 'Mehdi', '06 12 34 56 02', 'mehdi.k@labo-nord.fr', 'utilitaire', 40, '#10b981', true, encode(gen_random_bytes(32), 'hex'))
RETURNING id INTO v_livreur_id;
v_livreur_ids := v_livreur_ids || v_livreur_id;

INSERT INTO labo_livreurs (prothesiste_id, nom, prenom, telephone, email, vehicule, zone_rayon_km, couleur, actif, access_token)
VALUES (v_prothesiste_id, 'AMRANI', 'Youssef', '06 12 34 56 03', 'youssef.a@labo-nord.fr', 'voiture', 35, '#f59e0b', true, encode(gen_random_bytes(32), 'hex'))
RETURNING id INTO v_livreur_id;
v_livreur_ids := v_livreur_ids || v_livreur_id;

INSERT INTO labo_livreurs (prothesiste_id, nom, prenom, telephone, email, vehicule, zone_rayon_km, couleur, actif, access_token)
VALUES (v_prothesiste_id, 'LEROY', 'Antoine', '06 12 34 56 04', 'antoine.l@labo-nord.fr', 'voiture', 45, '#ef4444', true, encode(gen_random_bytes(32), 'hex'))
RETURNING id INTO v_livreur_id;
v_livreur_ids := v_livreur_ids || v_livreur_id;

RAISE NOTICE '✅ 4 coursiers créés';

-- =============================================
-- 2. CRÉER 160 DENTISTES — 40 PAR SECTEUR
-- =============================================

-- ─────────────────────────────────────────────
-- SECTEUR 1 : LILLE CENTRE/SUD (Nordine) — 40 dentistes
-- ─────────────────────────────────────────────
v_noms := ARRAY['DUPONT','MARTIN','LEFEBVRE','BERNARD','MOREAU','DURIEZ','LECLERCQ','DELPORTE','DELATTRE','DEVOS','THIBAUT','LAMBERT','GIRARD','ROUX','BLANCHARD','GARNIER','FAURE','PICARD','ROGER','BRUNET','LEMOINE','MARCHAND','HUBERT','GAILLARD','BARBIER','ARNAUD','MASSON','RIVIERE','CLEMENT','GAUTHIER','PERRIN','MORIN','CHEVALIER','ADAM','GUERIN','BRUN','LECLERC','NOEL','RENARD','MERCIER'];
v_prenoms := ARRAY['Isabelle','Philippe','Nathalie','Christophe','Sophie','Marc','Valérie','François','Caroline','Laurent','Éric','Catherine','Pierre','Annie','Jean','Dominique','Sylvie','Alain','Marie','Patrick','Nicolas','Hélène','Olivier','Sandrine','Bruno','Émilie','Vincent','Camille','Xavier','Mathilde','Rémi','Charlotte','Antoine','Élodie','Damien','Mélanie','Sébastien','Aurélie','Jérôme','Guillaume'];
v_adresses := ARRAY['42 rue Faidherbe','18 rue de Solférino','8 place de la République','56 bd Gambetta','120 rue de Wazemmes','3 rue de la Liberté','14 rue de la Monnaie','200 rue Nationale','75 rue d''Arras','10 av du Peuple Belge','33 rue Esquermoise','85 rue de Béthune','12 rue du Sec Arembault','45 bd de la Liberté','7 rue de Paris','22 rue du Molinel','100 rue Pierre Mauroy','60 rue de Tournai','5 place du Concert','90 av de la République','15 rue Inkermann','28 rue des Stations','42 rue de Douai','110 bd Jean-Baptiste Lebas','8 rue Négrier','35 rue de Roubaix','67 av de Dunkerque','95 rue du Faubourg de Béthune','20 rue Basse','44 bd Vauban','72 rue de Trévise','55 av Salomon','180 rue du Faubourg de Roubaix','30 rue de l''Hôpital Militaire','25 rue Léon Gambetta','16 rue Gustave Delory','88 rue Colbert','140 rue Nationale','50 rue des Postes','9 place Philippe Lebon'];
v_villes := ARRAY['Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Lille','Hellemmes','Hellemmes','Hellemmes','Hellemmes','Hellemmes','Faches-Thumesnil','Faches-Thumesnil','Faches-Thumesnil','Faches-Thumesnil','Faches-Thumesnil','Ronchin','Ronchin','Ronchin','Ronchin','Ronchin','Lesquin','Lesquin','Lesquin','Lesquin','Lesquin'];
v_cps := ARRAY['59000','59000','59000','59000','59000','59000','59800','59000','59000','59000','59000','59000','59000','59000','59000','59000','59000','59000','59000','59000','59260','59260','59260','59260','59260','59155','59155','59155','59155','59155','59790','59790','59790','59790','59790','59810','59810','59810','59810','59810'];

FOR v_idx IN 1..40 LOOP
  INSERT INTO dentistes_clients (prothesiste_id, reference_client, titre, nom, prenom, raison_sociale_cabinet, adresse_ligne1, code_postal, ville, telephone, email)
  VALUES (v_prothesiste_id, 'S1-' || LPAD(v_idx::text, 3, '0'), 'Dr', v_noms[v_idx], v_prenoms[v_idx],
    'Cabinet Dr ' || v_noms[v_idx], v_adresses[v_idx], v_cps[v_idx], v_villes[v_idx],
    '03 20 54 ' || LPAD((v_idx*11)::text, 2, '0') || ' ' || LPAD((v_idx*7)::text, 2, '0'),
    'dr.' || lower(v_noms[v_idx]) || '.' || lower(left(v_prenoms[v_idx],3)) || '@cabinet-lille-' || v_idx || '.fr')
  RETURNING id INTO v_dentiste_id;
  v_dentistes_s1 := v_dentistes_s1 || v_dentiste_id;
END LOOP;

RAISE NOTICE '✅ 40 dentistes Secteur 1 — Lille Centre/Sud (Nordine)';

-- ─────────────────────────────────────────────
-- SECTEUR 2 : ROUBAIX / TOURCOING (Mehdi) — 40 dentistes
-- ⭐ Dr BAHMED en position 8 (test notifications !)
-- ─────────────────────────────────────────────
v_noms := ARRAY['DELVENNE','COURTOIS','VASSEUR','DELCOURT','CARLIER','POULAIN','DESREUMAUX','BAHMED','VANDERBERGHE','CASTELAIN','HENNION','DESMOULINS','WATTRELOT','DESPLANQUE','DEROUBAIX','LEMAN','POTIER','FLAMENT','DECLERCK','DESCAMPS','SPRIET','CATOIRE','DEBACKER','HEDDEBAUT','SEYDOUX','DEROO','LEFRANC','PRUVOST','DANEL','CATTEAU','DEFRETIN','GHESQUIERE','DEWAELE','TIBERGHIEN','MULLIEZ','BONDUELLE','LESAFFRE','ROQUETTE','PROUVOST','MOTTE'];
v_prenoms := ARRAY['Thomas','Marie','Pierre','Aurélie','Julien','Sandrine','Nicolas','Karim','Émilie','Charlotte','Antoine','Élodie','Xavier','Mathilde','Rémi','Camille','Sébastien','Hélène','Bruno','Mélanie','Vincent','Patricia','Olivier','Damien','Caroline','Laurent','Isabelle','Philippe','Nathalie','François','Jean','Sophie','Marc','Valérie','Alain','Sylvie','Éric','Catherine','Dominique','Annie'];
v_adresses := ARRAY['15 rue de Lannoy','28 av Jean Lebas','42 rue Pierre de Roubaix','5 Grand Place','90 rue de l''Alma','33 rue du Général de Gaulle','18 bd de Strasbourg','72 rue du Coq Français','60 rue de l''Épeule','110 rue de Lille','45 bd Gambetta','22 rue du Vieil Abreuvoir','12 Grand Place','8 rue de la Cloche','55 bd de l''Égalité','18 rue Carnot','35 rue de la Gare','80 rue du Dragon','25 av de la Fosse aux Chênes','100 rue Jules Guesde','14 place de la Victoire','40 rue de Mouvaux','70 rue de Tournai','95 bd de l''Industrie','10 rue du Moulin','48 rue de Roubaix','30 avenue Motte','65 rue de la Croix Rouge','20 rue de Condé','88 rue de l''Union','44 bd de Fourmies','115 rue de Tourcoing','55 rue de Leers','25 rue Colbert','70 av de Verdun','35 rue du Tilleul','85 bd Descat','15 rue du Cimetière','50 rue Watt','125 rue de Lannoy'];
v_villes := ARRAY['Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Roubaix','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Tourcoing','Wattrelos','Wattrelos','Wattrelos','Wattrelos','Wattrelos','Croix','Croix','Croix','Wasquehal','Wasquehal'];
v_cps := ARRAY['59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59100','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59200','59150','59150','59150','59150','59150','59170','59170','59170','59290','59290'];

FOR v_idx IN 1..40 LOOP
  INSERT INTO dentistes_clients (prothesiste_id, reference_client, titre, nom, prenom, raison_sociale_cabinet, adresse_ligne1, code_postal, ville, telephone, email)
  VALUES (v_prothesiste_id, 'S2-' || LPAD(v_idx::text, 3, '0'), 'Dr', v_noms[v_idx], v_prenoms[v_idx],
    CASE WHEN v_idx = 8 THEN 'Cabinet Dr Bahmed' ELSE 'Cabinet Dr ' || v_noms[v_idx] END,
    v_adresses[v_idx], v_cps[v_idx], v_villes[v_idx],
    CASE WHEN v_idx = 8 THEN '03 20 73 00 01' ELSE '03 20 73 ' || LPAD((v_idx*11)::text, 2, '0') || ' ' || LPAD((v_idx*7)::text, 2, '0') END,
    CASE WHEN v_idx = 8 THEN 'contact@jadomi.fr' ELSE 'dr.' || lower(v_noms[v_idx]) || '.' || lower(left(v_prenoms[v_idx],3)) || '@cabinet-rbx-' || v_idx || '.fr' END)
  RETURNING id INTO v_dentiste_id;
  v_dentistes_s2 := v_dentistes_s2 || v_dentiste_id;
  IF v_idx = 8 THEN v_bahmed_id := v_dentiste_id; END IF;
END LOOP;

RAISE NOTICE '✅ 40 dentistes Secteur 2 — Roubaix/Tourcoing (Mehdi)';
RAISE NOTICE '   ⭐ Dr BAHMED Karim — 72 rue du Coq Français, Roubaix — ID: %', v_bahmed_id;

-- ─────────────────────────────────────────────
-- SECTEUR 3 : VILLENEUVE D'ASCQ / MARCQ (Youssef) — 40 dentistes
-- ─────────────────────────────────────────────
v_noms := ARRAY['CARPENTIER','FONTAINE','LEROUX','DUCROCQ','HERBAUT','VERLEY','WALLET','CRUQUE','LHERMITTE','POTTIER','FOURNIER','DELOBEL','LEMAIRE','BLONDEL','CARON','DELPLANQUE','FIEVET','GRARD','HAVREZ','LECOMTE','LECONTE','LEGRAND','LELONG','MARIAGE','PLATEAU','POLLET','RENARD','VANDENBERGHE','VANDENDRIESSCHE','VERHAEGHE','BONTE','COPIN','DECOSTER','DELASSUS','HALLEZ','HAZARD','LABBÉ','LEJEUNE','PETIT','WILLEMS'];
v_prenoms := ARRAY['Stéphane','Céline','Guillaume','Anne','Olivier','Sandrine','Vincent','Patricia','Damien','Mélanie','Mathilde','Xavier','Rémi','Charlotte','Sébastien','Aurélie','Nicolas','Hélène','Bruno','Élodie','Antoine','Camille','Pierre','Éric','Marie','Philippe','Caroline','François','Jean','Sophie','Marc','Valérie','Thomas','Isabelle','Alain','Sylvie','Laurent','Catherine','Dominique','Nathalie'];
v_adresses := ARRAY['1 place Salvador Allende','65 bd de Valmy','30 rue de la Cousinerie','12 place du Général de Gaulle','48 rue du Faubourg','5 av de Flandre','80 rue Jean Jaurès','22 rue Pasteur','110 bd de Tournai','15 rue du Château','25 av Foch','44 rue de la République','70 rue du 8 Mai 1945','35 av de la Marne','8 place de l''Europe','90 rue Gustave Delory','20 av de Bretagne','55 rue Marx Dormoy','40 rue du Maréchal Foch','100 bd de l''Ouest','15 av du Maréchal Leclerc','28 rue de Tourcoing','50 rue de la Liberté','75 av de Flandre','6 place de la Mairie','38 rue Albert Bailly','60 av de la Résistance','85 rue du Quesne','95 bd du Général de Gaulle','120 rue de Lille','10 rue Kleber','33 rue Gustave Delory','45 av Foch','68 rue de la Station','14 place de la Marne','82 rue Roger Salengro','105 av de la République','52 rue Jean Moulin','25 bd de la Liberté','40 rue de Tournai'];
v_villes := ARRAY['Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Villeneuve-d''Ascq','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Marcq-en-Barœul','Mons-en-Barœul','Mons-en-Barœul','Mons-en-Barœul','Mons-en-Barœul','Mons-en-Barœul','Hem','Hem','Hem','Hem','Hem','Lys-lez-Lannoy','Lys-lez-Lannoy','Lys-lez-Lannoy','Lys-lez-Lannoy','Lys-lez-Lannoy','Forest-sur-Marque','Forest-sur-Marque','Forest-sur-Marque','Sainghin-en-Mélantois','Sainghin-en-Mélantois'];
v_cps := ARRAY['59650','59650','59650','59650','59650','59650','59650','59650','59650','59650','59650','59650','59700','59700','59700','59700','59700','59700','59700','59700','59370','59370','59370','59370','59370','59510','59510','59510','59510','59510','59390','59390','59390','59390','59390','59510','59510','59510','59262','59262'];

FOR v_idx IN 1..40 LOOP
  INSERT INTO dentistes_clients (prothesiste_id, reference_client, titre, nom, prenom, raison_sociale_cabinet, adresse_ligne1, code_postal, ville, telephone, email)
  VALUES (v_prothesiste_id, 'S3-' || LPAD(v_idx::text, 3, '0'), 'Dr', v_noms[v_idx], v_prenoms[v_idx],
    'Cabinet Dr ' || v_noms[v_idx], v_adresses[v_idx], v_cps[v_idx], v_villes[v_idx],
    '03 20 91 ' || LPAD((v_idx*11)::text, 2, '0') || ' ' || LPAD((v_idx*7)::text, 2, '0'),
    'dr.' || lower(v_noms[v_idx]) || '.' || lower(left(v_prenoms[v_idx],3)) || '@cabinet-vda-' || v_idx || '.fr')
  RETURNING id INTO v_dentiste_id;
  v_dentistes_s3 := v_dentistes_s3 || v_dentiste_id;
END LOOP;

RAISE NOTICE '✅ 40 dentistes Secteur 3 — VDA/Marcq/Mons/Hem (Youssef)';

-- ─────────────────────────────────────────────
-- SECTEUR 4 : ARMENTIÈRES / LAMBERSART / LOMME (Antoine) — 40 dentistes
-- ─────────────────────────────────────────────
v_noms := ARRAY['WATTEL','CARTON','DELVALLE','LESAGE','BECQUART','DEBLOCK','GOSSELIN','PAUWELS','DEPREZ','MARECHAL','SALMON','BEAUMONT','COUSIN','DUTHOIT','FAVIER','HANOT','JOUBERT','LAINE','MAILLOT','NORMAND','BOURGOIS','COCHARD','DEGUISE','DENECKER','DEVULDER','GLORIEUX','HANTSON','IMBERT','JACOB','KAISIN','LANVIN','MORISSE','NEUVILLE','OBIN','PLANCKE','QUEVY','ROLLAND','SAUVAGE','THOREL','VIRNOT'];
v_prenoms := ARRAY['Bruno','Hélène','Rémi','Antoine','Élodie','Xavier','Camille','Damien','Mélanie','Sébastien','Aurélie','Nicolas','Charlotte','Vincent','Patricia','Olivier','Sandrine','Marc','Valérie','Thomas','Isabelle','Alain','Sylvie','Laurent','Catherine','Dominique','Nathalie','Philippe','Marie','François','Jean','Sophie','Pierre','Éric','Mathilde','Annie','Caroline','Guillaume','Stéphane','Céline'];
v_adresses := ARRAY['30 rue de Lille','14 rue Jean Jaurès','50 av de l''Hippodrome','38 rue du Gén. de Gaulle','5 rue de Lille','78 rue du Mar. Foch','16 rue du Mar. Foch','25 av de Dunkerque','60 rue du Bourg','40 rue Carnot','90 av du Mar. Leclerc','12 rue de la Gare','55 bd de la République','80 av de Bretagne','20 rue Nationale','35 place de la Mairie','65 rue de Flandre','100 bd de l''Yser','15 rue du Château','45 av de la Marne','8 rue Roger Salengro','70 rue Victor Hugo','95 av de Verdun','10 place de la Liberté','28 rue Pasteur','42 rue Colbert','85 bd de Strasbourg','115 rue de Lannoy','22 rue de la Station','50 av de la Résistance','33 rue du Pont Neuf','68 av du Gén. de Gaulle','44 rue Jean Moulin','88 bd Clémenceau','14 rue de la Paix','105 rue de Canteleu','52 place de la Victoire','120 rue du Vieux Chemin','25 av Foch','40 rue de Pérenchies'];
v_villes := ARRAY['Armentières','Armentières','Armentières','Armentières','Armentières','Armentières','Armentières','Armentières','Houplines','Houplines','Houplines','Houplines','Lambersart','Lambersart','Lambersart','Lambersart','Lambersart','Lambersart','Lambersart','Lambersart','La Madeleine','La Madeleine','La Madeleine','La Madeleine','La Madeleine','Saint-André-lez-Lille','Saint-André-lez-Lille','Saint-André-lez-Lille','Lomme','Lomme','Lomme','Lomme','Lomme','Loos','Loos','Loos','Loos','Halluin','Halluin','Halluin'];
v_cps := ARRAY['59280','59280','59280','59280','59280','59280','59280','59280','59116','59116','59116','59116','59130','59130','59130','59130','59130','59130','59130','59130','59110','59110','59110','59110','59110','59350','59350','59350','59160','59160','59160','59160','59160','59120','59120','59120','59120','59250','59250','59250'];

FOR v_idx IN 1..40 LOOP
  INSERT INTO dentistes_clients (prothesiste_id, reference_client, titre, nom, prenom, raison_sociale_cabinet, adresse_ligne1, code_postal, ville, telephone, email)
  VALUES (v_prothesiste_id, 'S4-' || LPAD(v_idx::text, 3, '0'), 'Dr', v_noms[v_idx], v_prenoms[v_idx],
    'Cabinet Dr ' || v_noms[v_idx], v_adresses[v_idx], v_cps[v_idx], v_villes[v_idx],
    '03 20 35 ' || LPAD((v_idx*11)::text, 2, '0') || ' ' || LPAD((v_idx*7)::text, 2, '0'),
    'dr.' || lower(v_noms[v_idx]) || '.' || lower(left(v_prenoms[v_idx],3)) || '@cabinet-arm-' || v_idx || '.fr')
  RETURNING id INTO v_dentiste_id;
  v_dentistes_s4 := v_dentistes_s4 || v_dentiste_id;
END LOOP;

RAISE NOTICE '✅ 40 dentistes Secteur 4 — Armentières/Lambersart/Lomme (Antoine)';
RAISE NOTICE '📊 Total : 160 dentistes créés dans le Nord';

-- =============================================
-- 3. GÉNÉRER TOURNÉES — SEMAINE COMPLÈTE
--    Du lundi 5 au samedi 10 mai 2026
--    Chaque coursier : 20 matin + 20 après-midi = 40/jour
-- =============================================

FOR v_jour_idx IN 0..5 LOOP
  v_jour := '2026-05-05'::DATE + v_jour_idx;

  -- Pour chaque coursier (4 secteurs)
  FOR v_idx IN 1..4 LOOP
    v_livreur_id := v_livreur_ids[v_idx];

    -- Sélectionner les dentistes du secteur
    CASE v_idx
      WHEN 1 THEN v_batch := v_dentistes_s1;
      WHEN 2 THEN v_batch := v_dentistes_s2;
      WHEN 3 THEN v_batch := v_dentistes_s3;
      WHEN 4 THEN v_batch := v_dentistes_s4;
    END CASE;

    -- Pour chaque créneau (matin + après-midi)
    FOREACH v_creneau IN ARRAY ARRAY['matin', 'apres_midi'] LOOP

      -- Statut des tournées : terminées sauf AUJOURD'HUI matin pour Mehdi
      IF v_jour = CURRENT_DATE AND v_idx = 2 AND v_creneau = 'matin' THEN
        v_statut_tournee := 'en_cours';
        v_heure_depart_t := (v_jour || ' 08:15:00')::timestamptz;
        v_heure_fin_t := NULL;
      ELSIF v_jour > CURRENT_DATE THEN
        v_statut_tournee := 'planifiee';
        v_heure_depart_t := NULL;
        v_heure_fin_t := NULL;
      ELSE
        v_statut_tournee := 'terminee';
        v_heure_depart_t := (v_jour || CASE WHEN v_creneau = 'matin' THEN ' 08:15:00' ELSE ' 13:45:00' END)::timestamptz;
        v_heure_fin_t := (v_jour || CASE WHEN v_creneau = 'matin' THEN ' 11:30:00' ELSE ' 17:00:00' END)::timestamptz;
      END IF;

      INSERT INTO labo_tournees_livreur (
        prothesiste_id, livreur_id, date, creneau, nb_arrets,
        distance_totale_km, duree_estimee_min, statut,
        heure_depart, heure_fin, navigation_app, notes, ordre_arrets
      ) VALUES (
        v_prothesiste_id, v_livreur_id, v_jour, v_creneau, 20,
        35 + (random()*15)::int, 120 + (random()*30)::int, v_statut_tournee,
        v_heure_depart_t, v_heure_fin_t,
        CASE WHEN v_idx IN (1,3) THEN 'waze' ELSE 'google_maps' END,
        'Secteur ' || v_idx || ' — ' || v_creneau || ' — ' || v_jour,
        '[]'::jsonb
      ) RETURNING id INTO v_tournee_id;

      -- Sauvegarder la tournée spéciale de Mehdi ce matin (pour les notifs)
      IF v_jour = CURRENT_DATE AND v_idx = 2 AND v_creneau = 'matin' THEN
        v_bahmed_tournee_id := v_tournee_id;
      END IF;

      -- Créer 20 demandes + arrêts pour ce créneau
      -- Matin = dentistes 1-20, Après-midi = dentistes 21-40
      FOR v_dentiste_id IN
        SELECT unnest(
          CASE WHEN v_creneau = 'matin'
            THEN v_batch[1:20]
            ELSE v_batch[21:40]
          END
        )
      LOOP
        -- Insérer la demande de passage
        INSERT INTO labo_demandes_passage (
          prothesiste_id, dentiste_client_id, origine, type_passage, priorite,
          references_travaux, nb_colis, date_souhaitee, creneau,
          statut, tournee_id, livreur_id,
          heure_passage, bon_passage_valide
        ) VALUES (
          v_prothesiste_id, v_dentiste_id,
          CASE WHEN random() > 0.5 THEN 'prothesiste' ELSE 'dentiste' END,
          CASE WHEN random() > 0.6 THEN 'livraison' WHEN random() > 0.3 THEN 'recuperation' ELSE 'les_deux' END,
          CASE WHEN random() > 0.85 THEN 'urgent' ELSE 'normal' END,
          ARRAY['CAS-' || to_char(v_jour, 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6)],
          1 + (random()*3)::int,
          v_jour, v_creneau,
          CASE
            WHEN v_statut_tournee = 'terminee' THEN 'livree'
            WHEN v_statut_tournee = 'planifiee' THEN 'planifiee'
            ELSE 'planifiee' -- en_cours : on met planifiee, les arrêts gèrent le détail
          END,
          v_tournee_id, v_livreur_id,
          CASE WHEN v_statut_tournee = 'terminee'
            THEN (v_jour || CASE WHEN v_creneau = 'matin' THEN ' 08:' ELSE ' 14:' END || LPAD((15 + (random()*40)::int)::text, 2, '0') || ':00')::timestamptz
            ELSE NULL
          END,
          CASE WHEN v_statut_tournee = 'terminee' THEN true ELSE false END
        ) RETURNING id INTO v_demande_id;

        -- Sauvegarder la demande Bahmed pour les notifications
        IF v_dentiste_id = v_bahmed_id AND v_jour = CURRENT_DATE AND v_creneau = 'matin' THEN
          v_bahmed_demande_id := v_demande_id;
        END IF;
      END LOOP;

      -- Créer les arrêts de tournée
      INSERT INTO labo_arrets_tournee (
        tournee_id, demande_id, dentiste_client_id, ordre, type_passage, statut,
        heure_arrivee, heure_depart, bon_passage_valide
      )
      SELECT
        v_tournee_id, dp.id, dp.dentiste_client_id,
        row_number() OVER (ORDER BY dp.created_at),
        dp.type_passage,
        CASE
          WHEN v_statut_tournee = 'terminee' THEN 'termine'
          WHEN v_statut_tournee = 'planifiee' THEN 'a_faire'
          -- SCÉNARIO LIVE : Mehdi ce matin, arrêts 1-7 terminés, 8=Dr Bahmed en_route, 9-20 à faire
          WHEN v_statut_tournee = 'en_cours' THEN
            CASE
              WHEN row_number() OVER (ORDER BY dp.created_at) <= 7 THEN 'termine'
              WHEN row_number() OVER (ORDER BY dp.created_at) = 8 THEN 'en_route'
              ELSE 'a_faire'
            END
        END,
        CASE
          WHEN v_statut_tournee = 'terminee' THEN dp.heure_passage
          WHEN v_statut_tournee = 'en_cours' AND row_number() OVER (ORDER BY dp.created_at) <= 7
            THEN (v_jour || ' 08:' || LPAD((20 + (row_number() OVER (ORDER BY dp.created_at) * 8))::text, 2, '0') || ':00')::timestamptz
          ELSE NULL
        END,
        CASE
          WHEN v_statut_tournee = 'terminee' THEN dp.heure_passage + interval '8 minutes'
          WHEN v_statut_tournee = 'en_cours' AND row_number() OVER (ORDER BY dp.created_at) <= 7
            THEN (v_jour || ' 08:' || LPAD((25 + (row_number() OVER (ORDER BY dp.created_at) * 8))::text, 2, '0') || ':00')::timestamptz
          ELSE NULL
        END,
        CASE
          WHEN v_statut_tournee = 'terminee' THEN true
          WHEN v_statut_tournee = 'en_cours' AND row_number() OVER (ORDER BY dp.created_at) <= 7 THEN true
          ELSE false
        END
      FROM labo_demandes_passage dp
      WHERE dp.tournee_id = v_tournee_id
      ORDER BY dp.created_at;

    END LOOP; -- fin créneau
  END LOOP; -- fin coursier

  RAISE NOTICE '  📅 Jour % (%) — 8 tournées × 20 arrêts = 160 passages', v_jour_idx + 1, v_jour;

END LOOP; -- fin jour

-- =============================================
-- 4. SCÉNARIO LIVE — NOTIFICATIONS DR BAHMED
--    Mehdi vient de finir chez Dr Desmoulins (arrêt 7)
--    → Notification "en_route" vers Dr Bahmed (arrêt 8)
--    → Notification "arrive_bientot" (ETA ~8 min)
-- =============================================

-- Récupérer l'arrêt de Dr Bahmed dans la tournée live
SELECT at.id INTO v_bahmed_arret_id
FROM labo_arrets_tournee at
JOIN labo_demandes_passage dp ON dp.id = at.demande_id
WHERE dp.dentiste_client_id = v_bahmed_id
  AND at.tournee_id = v_bahmed_tournee_id
LIMIT 1;

-- Mettre à jour la demande Bahmed en statut "en_cours_envoi"
UPDATE labo_demandes_passage
SET statut = 'en_cours_envoi'
WHERE dentiste_client_id = v_bahmed_id AND tournee_id = v_bahmed_tournee_id;

-- Récupérer la demande et l'arrêt de Dr Bahmed depuis les données insérées
SELECT dp.id INTO v_bahmed_demande_id
FROM labo_demandes_passage dp
WHERE dp.dentiste_client_id = v_bahmed_id
  AND dp.tournee_id = v_bahmed_tournee_id
LIMIT 1;

SELECT at.id INTO v_bahmed_arret_id
FROM labo_arrets_tournee at
JOIN labo_demandes_passage dp ON dp.id = at.demande_id
WHERE dp.dentiste_client_id = v_bahmed_id
  AND at.tournee_id = v_bahmed_tournee_id
LIMIT 1;

RAISE NOTICE '🔔 Bahmed demande_id: %, arret_id: %', v_bahmed_demande_id, v_bahmed_arret_id;

-- Mettre la position GPS de Mehdi (à côté du cabinet précédent, Roubaix centre)
UPDATE labo_livreurs
SET derniere_position = jsonb_build_object(
    'lat', 50.6892,
    'lng', 3.1746,
    'precision', 5,
    'vitesse', 35,
    'timestamp', now()::text
  ),
  position_updated_at = now()
WHERE id = v_livreur_ids[2]; -- Mehdi

-- Notification 1 : Le dentiste précédent est terminé, Mehdi part vers Bahmed
INSERT INTO labo_notifications_dentiste (
  prothesiste_id, dentiste_client_id, tournee_id, demande_id,
  type, message, email_envoye, notification_push, lu
) VALUES (
  v_prothesiste_id, v_bahmed_id, v_bahmed_tournee_id, v_bahmed_demande_id,
  'en_route',
  'Votre livreur Mehdi KADDOURI est en route vers votre cabinet. Il vient de terminer sa livraison précédente à Roubaix centre.',
  false, false, false
);

-- Notification 2 : ETA 8 minutes
INSERT INTO labo_notifications_dentiste (
  prothesiste_id, dentiste_client_id, tournee_id, demande_id,
  type, message, email_envoye, notification_push, lu,
  created_at
) VALUES (
  v_prothesiste_id, v_bahmed_id, v_bahmed_tournee_id, v_bahmed_demande_id,
  'arrive_bientot',
  'Votre livreur arrivera dans environ 8 minutes au 72 rue du Coq Français avec votre prothèse. Référence : ' ||
    COALESCE((SELECT references_travaux[1] FROM labo_demandes_passage WHERE id = v_bahmed_demande_id), 'CAS-2026-0847'),
  false, false, false,
  now() + interval '2 minutes'
);

-- Notifications pour les 7 arrêts déjà livrés ce matin (historique)
INSERT INTO labo_notifications_dentiste (prothesiste_id, dentiste_client_id, tournee_id, demande_id, type, message, email_envoye, lu, created_at)
SELECT
  v_prothesiste_id, dp.dentiste_client_id, v_bahmed_tournee_id, dp.id,
  CASE WHEN dp.type_passage = 'livraison' THEN 'livre' ELSE 'recupere' END,
  CASE WHEN dp.type_passage = 'livraison'
    THEN 'Votre prothèse a été livrée avec succès par Mehdi KADDOURI. Merci de votre confiance.'
    ELSE 'Vos empreintes ont été récupérées par Mehdi KADDOURI. Elles sont en route vers le laboratoire.'
  END,
  true, true,
  at.heure_arrivee
FROM labo_arrets_tournee at
JOIN labo_demandes_passage dp ON dp.id = at.demande_id
WHERE at.tournee_id = v_bahmed_tournee_id
  AND at.statut = 'termine'
  AND dp.dentiste_client_id != v_bahmed_id;

-- Positions GPS simulées pour Mehdi (trajet vers Dr Bahmed)
INSERT INTO labo_positions_livreur (livreur_id, tournee_id, latitude, longitude, precision_m, vitesse_kmh, heading, batterie, created_at)
VALUES
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6842, 3.1690, 4, 42, 45, 85, now() - interval '6 minutes'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6862, 3.1712, 3, 38, 50, 84, now() - interval '5 minutes'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6878, 3.1730, 5, 30, 55, 84, now() - interval '4 minutes'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6885, 3.1738, 3, 25, 48, 83, now() - interval '3 minutes'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6890, 3.1742, 4, 35, 42, 83, now() - interval '2 minutes'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6892, 3.1746, 3, 20, 40, 82, now() - interval '1 minute'),
  (v_livreur_ids[2], v_bahmed_tournee_id, 50.6895, 3.1750, 5, 15, 38, 82, now() - interval '30 seconds');

RAISE NOTICE '';
RAISE NOTICE '══════════════════════════════════════════════════════════';
RAISE NOTICE '✅ SIMULATION COMPLÈTE — NORD DE LA FRANCE';
RAISE NOTICE '══════════════════════════════════════════════════════════';
RAISE NOTICE '';
RAISE NOTICE '📊 CHIFFRES :';
RAISE NOTICE '   🦷 160 dentistes (40 par secteur)';
RAISE NOTICE '   🚚 4 coursiers avec tokens app mobile';
RAISE NOTICE '   📅 6 jours (Lun 5 → Sam 10 mai 2026)';
RAISE NOTICE '   📋 48 tournées (4 × 2 × 6)';
RAISE NOTICE '   📦 960 demandes de passage';
RAISE NOTICE '   📍 960 arrêts de tournée';
RAISE NOTICE '';
RAISE NOTICE '🗺️ SECTEURS (40 dentistes chacun) :';
RAISE NOTICE '   🟣 Nordine  → Lille/Hellemmes/Faches/Ronchin/Lesquin';
RAISE NOTICE '   🟢 Mehdi    → Roubaix/Tourcoing/Wattrelos/Croix/Wasquehal';
RAISE NOTICE '   🟡 Youssef  → VDA/Marcq/Mons/Hem/Lys/Forest/Sainghin';
RAISE NOTICE '   🔴 Antoine  → Armentières/Houplines/Lambersart/La Madeleine/Saint-André/Lomme/Loos/Halluin';
RAISE NOTICE '';
RAISE NOTICE '🔔 SCÉNARIO LIVE (test notifications) :';
RAISE NOTICE '   ⭐ Dr BAHMED Karim — 72 rue du Coq Français, Roubaix';
RAISE NOTICE '   🚚 Mehdi en route → arrêts 1-7 terminés, arrêt 8 = Dr Bahmed (EN ROUTE)';
RAISE NOTICE '   📱 2 notifications non lues :';
RAISE NOTICE '      → "Votre livreur Mehdi est en route vers votre cabinet"';
RAISE NOTICE '      → "Arrivera dans environ 8 minutes au 72 rue du Coq Français"';
RAISE NOTICE '   📍 7 positions GPS simulées (trajet Mehdi vers le cabinet)';
RAISE NOTICE '';
RAISE NOTICE '💡 POUR TESTER :';
RAISE NOTICE '   1. Allez sur le dashboard dentiste (index.html)';
RAISE NOTICE '   2. Cliquez sur la cloche de notifications';
RAISE NOTICE '   3. Vous verrez "Livreur en route" + "Arrive dans 8 min"';
RAISE NOTICE '   4. Sur /labo/suivi-livreurs.html → Mehdi visible sur la carte GPS';

END $$;
