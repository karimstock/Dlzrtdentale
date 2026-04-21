-- Creer la societe LK Immo
INSERT INTO societes (
  owner_id, type, nom, secteur, regime_fiscal,
  adresse, code_postal, ville, pays,
  siren, code_ape, actif
) VALUES (
  'ff866c7a-19c7-4df1-a6fe-56a5e1261629',
  'sci',
  'LK Immo',
  'autre',
  'IR',
  '56 Boulevard du General Leclerc',
  '59100',
  'Roubaix',
  'France',
  '808252027',
  '6619A',
  true
);

-- Ajouter le role proprietaire
INSERT INTO user_societe_roles (user_id, societe_id, role)
SELECT 'ff866c7a-19c7-4df1-a6fe-56a5e1261629', id, 'proprietaire'
FROM societes WHERE siren = '808252027';
