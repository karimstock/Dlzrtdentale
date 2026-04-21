-- =============================================
-- JADOMI LABO — Seed teintiers complets
-- =============================================

-- Nettoyage
DELETE FROM teintiers;

-- === VITA Classical A1-D4 (16 teintes) ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'A1', 'A', 1, '#F5E6C8'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'A2', 'A', 2, '#EDD9B3'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'A3', 'A', 3, '#E5CC9E'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'A3.5', 'A', 4, '#DCBF89'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'A4', 'A', 5, '#D4B274'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'B1', 'B', 6, '#F2E8D0'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'B2', 'B', 7, '#E8DABB'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'B3', 'B', 8, '#DECDA6'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'B4', 'B', 9, '#D4BF91'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'C1', 'C', 10, '#EDE0C4'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'C2', 'C', 11, '#E0D3AE'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'C3', 'C', 12, '#D3C698'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'C4', 'C', 13, '#C6B982'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'D2', 'D', 14, '#E8D8B8'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'D3', 'D', 15, '#DBCBA3'),
('vita_classical', 'VITA Classical', 'VITA Zahnfabrik', 'dent', 'D4', 'D', 16, '#CEBE8E');

-- === VITA Classical Bleach ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('vita_bleach', 'VITA Classical Bleach', 'VITA Zahnfabrik', 'dent', '0M1', 'Bleach', 1, '#FEFCF5'),
('vita_bleach', 'VITA Classical Bleach', 'VITA Zahnfabrik', 'dent', '0M2', 'Bleach', 2, '#FBF7EA'),
('vita_bleach', 'VITA Classical Bleach', 'VITA Zahnfabrik', 'dent', '0M3', 'Bleach', 3, '#F8F2DF');

-- === VITA 3D-Master (29 teintes) ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '0M1', '0', 1, '#FEFCF5'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '0M2', '0', 2, '#FBF7EA'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '0M3', '0', 3, '#F8F2DF'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '1M1', '1', 4, '#F5EDD5'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '1M2', '1', 5, '#F0E5C8'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2L1.5', '2', 6, '#F2EACD'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2L2.5', '2', 7, '#E8DCBA'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2M1', '2', 8, '#EDE2C0'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2M2', '2', 9, '#E5D9B3'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2M3', '2', 10, '#DDD0A6'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2R1.5', '2', 11, '#EDDDB5'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '2R2.5', '2', 12, '#E3D0A2'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3L1.5', '3', 13, '#E5DBBA'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3L2.5', '3', 14, '#DBCEA7'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3M1', '3', 15, '#E0D5AD'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3M2', '3', 16, '#D8CCA0'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3M3', '3', 17, '#D0C393'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3R1.5', '3', 18, '#E0D0A2'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '3R2.5', '3', 19, '#D6C38F'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4L1.5', '4', 20, '#D8CDA7'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4L2.5', '4', 21, '#CEC094'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4M1', '4', 22, '#D3C89A'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4M2', '4', 23, '#CBBF8D'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4M3', '4', 24, '#C3B680'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4R1.5', '4', 25, '#D3C08F'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '4R2.5', '4', 26, '#C9B37C'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '5M1', '5', 27, '#C6BB87'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '5M2', '5', 28, '#BEB27A'),
('vita_3d_master', 'VITA 3D-Master', 'VITA Zahnfabrik', 'dent', '5M3', '5', 29, '#B6A96D');

-- === Chromascop Ivoclar (20 teintes) ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '110', '100', 1, '#FCF8EE'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '120', '100', 2, '#F5EDDA'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '130', '100', 3, '#EEE2C6'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '140', '100', 4, '#E7D7B2'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '210', '200', 5, '#F5EDD5'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '220', '200', 6, '#EDE2C0'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '230', '200', 7, '#E5D7AB'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '240', '200', 8, '#DDCC96'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '310', '300', 9, '#F0E5C8'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '320', '300', 10, '#E8DAB3'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '330', '300', 11, '#E0CF9E'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '340', '300', 12, '#D8C489'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '410', '400', 13, '#EDDCB8'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '420', '400', 14, '#E3CEA0'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '430', '400', 15, '#D9C088'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '440', '400', 16, '#CFB270'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '510', '500', 17, '#E8D4A8'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '520', '500', 18, '#DEC690'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '530', '500', 19, '#D4B878'),
('chromascop', 'Chromascop', 'Ivoclar Vivadent', 'dent', '540', '500', 20, '#CAAA60');

-- === IPS e.max Bleach ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('emax_bleach', 'IPS e.max Bleach', 'Ivoclar Vivadent', 'dent', 'BL1', 'Bleach', 1, '#FFFEF8'),
('emax_bleach', 'IPS e.max Bleach', 'Ivoclar Vivadent', 'dent', 'BL2', 'Bleach', 2, '#FDFBF0'),
('emax_bleach', 'IPS e.max Bleach', 'Ivoclar Vivadent', 'dent', 'BL3', 'Bleach', 3, '#FBF8E8'),
('emax_bleach', 'IPS e.max Bleach', 'Ivoclar Vivadent', 'dent', 'BL4', 'Bleach', 4, '#F9F5E0');

-- === Teintier gingival Ivoclar ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'G1', 'G', 1, '#F0B8A0'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'G2', 'G', 2, '#E8A890'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'G3', 'G', 3, '#E09880'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'G4', 'G', 4, '#D88870'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'G5', 'G', 5, '#D07860'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'IG1', 'IG', 6, '#C89888'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'IG2', 'IG', 7, '#C08878'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'IG3', 'IG', 8, '#B87868'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'IG4', 'IG', 9, '#B06858'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'IG5', 'IG', 10, '#A85848'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'BG', 'BG', 11, '#E0C0B0'),
('gingival_ivoclar', 'Teintier Gingival', 'Ivoclar Vivadent', 'gencive', 'BG34', 'BG', 12, '#D8B0A0');

-- === Teintier gingival Heraeus ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('gingival_heraeus', 'Teintier Gingival Heraeus', 'Heraeus Kulzer', 'gencive', 'GUM01', 'GUM', 1, '#F0B0A0'),
('gingival_heraeus', 'Teintier Gingival Heraeus', 'Heraeus Kulzer', 'gencive', 'GUM02', 'GUM', 2, '#E8A090'),
('gingival_heraeus', 'Teintier Gingival Heraeus', 'Heraeus Kulzer', 'gencive', 'GUM03', 'GUM', 3, '#E09080'),
('gingival_heraeus', 'Teintier Gingival Heraeus', 'Heraeus Kulzer', 'gencive', 'GUM04', 'GUM', 4, '#D88070'),
('gingival_heraeus', 'Teintier Gingival Heraeus', 'Heraeus Kulzer', 'gencive', 'GUM05', 'GUM', 5, '#D07060');

-- === Noritake (identique Vita Classical) ===
INSERT INTO teintiers (code_systeme, nom_systeme, fabricant, type, code_teinte, groupe, ordre_affichage, couleur_hex) VALUES
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'A1', 'A', 1, '#F5E6C8'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'A2', 'A', 2, '#EDD9B3'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'A3', 'A', 3, '#E5CC9E'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'A3.5', 'A', 4, '#DCBF89'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'A4', 'A', 5, '#D4B274'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'B1', 'B', 6, '#F2E8D0'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'B2', 'B', 7, '#E8DABB'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'B3', 'B', 8, '#DECDA6'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'B4', 'B', 9, '#D4BF91'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'C1', 'C', 10, '#EDE0C4'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'C2', 'C', 11, '#E0D3AE'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'C3', 'C', 12, '#D3C698'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'C4', 'C', 13, '#C6B982'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'D2', 'D', 14, '#E8D8B8'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'D3', 'D', 15, '#DBCBA3'),
('noritake', 'Noritake CZR', 'Noritake', 'dent', 'D4', 'D', 16, '#CEBE8E');
