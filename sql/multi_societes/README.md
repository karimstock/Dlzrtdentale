# JADOMI — Migrations multi-sociétés

Exécuter dans **Supabase → SQL Editor** dans cet ordre :

1. `01_foundations.sql` — tables `societes`, `user_societe_roles`, `audit_log`, helpers, RLS
2. `02_sci.sql` — module SCI (biens, locataires, quittances, relances, compteurs)
3. `03_commerce.sql` — module société commerciale (produits, clients, devis, factures…)
4. `04_mailing.sql` — module mailing & campagnes

Tous les fichiers sont **idempotents** (safe à réexécuter).

## Rollback

`99_rollback.sql` supprime tout le schéma multi-sociétés. **Destructif**, à n'utiliser qu'en cas de besoin.

## Test d'isolation RLS

Créer deux users test dans Supabase Auth, créer une société pour chacun, vérifier qu'aucun ne voit la société de l'autre :

```sql
-- Connecté en tant qu'user A
SELECT * FROM public.societes; -- ne doit retourner QUE les sociétés d'A
```
