# JADOMI — PASSE 27 : LANDINGS METIER DEDIEES + VISUELS REELS

> Prompt sauvegarde le 22 avril 2026 — a lancer apres feedback epouse avocate

## AVANT TOUTE ACTION

1. LIS /home/ubuntu/jadomi/CODEX.md
2. Verifie que Passes 24, 25, 26 sont en place
3. A la FIN : mets a jour CODEX.md + commit git "chore(codex): update after Passe 27"

## CONTEXTE STRATEGIQUE

Le Dr Karim a identifie un probleme MAJEUR sur la landing Passe 26 :
"C'est bien mais trop mix de metiers, je prefere une landing par 
profession, et pas d'images c'est pas top. On est perdu."

Lecon strategique (Stripe/Shopify/Notion playbook) :
Les meilleurs SaaS multi-verticaux font UNE landing par segment cible.

## OBJECTIF

1. Transformer /public/landing.html en HUB minimaliste "Choisissez votre metier"
2. Creer 7 landings metier dediees, chacune 100% focused sur son audience
3. Ajouter des VISUELS REELS (images, mockups, SVG stylises)

## STRUCTURE URLS

```
/public/landing.html     -> Hub minimaliste "Choisissez votre metier"
/public/avocats.html     -> Landing 100% avocat
/public/dentistes.html   -> Landing 100% dentiste
/public/coiffeurs.html   -> Landing 100% coiffeur
/public/btp.html         -> Landing 100% artisan BTP
/public/prothesistes.html -> Landing 100% prothesiste
/public/sci.html         -> Landing 100% SCI
/public/createurs.html   -> Landing 100% createur
```

## HUB /public/landing.html (REFONTE)

Hero minimaliste + grid 7 cards metiers + footer.
- Background noir profond (#0a0a0f) avec degrade subtil
- Grid 3 colonnes desktop, 2 tablet, 1 mobile
- Cards avec hover scale(1.03) + glow colore par theme
- Couleur signature par metier :
  - Avocats : #004d3f (emerald)
  - Dentistes : #2563eb (blue clinical)
  - Coiffeurs : #e11d48 (rose)
  - BTP : #b45309 (bronze)
  - Prothesistes : #be185d (porcelain pink)
  - SCI : #1e3a8a (navy)
  - Createurs : #7c3aed (purple)

## LANDING AVOCAT (modele pour les autres)

### Sections :
A. Hero avec image fond cabinet juridique
   - Headline : "Votre cabinet merite la meme rigueur que vos plaidoiries."
   - Sous-titre : "JADOMI transforme votre pratique en experience numerique..."
   - CTAs : "Creer mon espace cabinet" + "Voir un exemple de site avocat"
   - Badge : "Compatible obligations CNB et RGPD"

B. Problemes cibles :
   - Site web date
   - Clients peinent a prendre RDV
   - Documents partages par email non securise
   - Facturation manuelle
   - Mentions legales jamais a jour

C. Solutions JADOMI (5 blocks avec visuels mockup) :
   1. Site vitrine premium (themes Midnight Emerald, Charcoal Bronze)
   2. Prise de RDV en ligne 24/7
   3. Espace client securise
   4. Chatbot IA premier contact
   5. Facturation honoraires

D. Temoignage illustratif (marque comme exemple)
E. Pricing adapte (Professionnel 79€ recommande)
F. CTA final

### CTA avocats → /wizard-societe.html?type=juridique

## AUTRES LANDINGS (meme structure, contenu adapte)

### dentistes.html
- Headline : "Votre cabinet connecte. En 10 minutes."
- Solutions : Stock intelligent, Panier IA, GPO -15%, Paniers groupes, Scanner factures IA
- Themes : Clinical White, Ocean Deep
- CTA → /wizard-societe.html?type=cabinet_dentaire

### coiffeurs.html
- Headline : "Un salon. Une vitrine. Une reputation."
- Solutions : Reservations 24/7, Fiches clients, Stock produits, Galerie avant/apres
- Themes : Rose Porcelain, Terracotta
- CTA → /wizard-societe.html?type=services

### btp.html
- Headline : "Chantiers organises. Devis gagnes. Image soignee."
- Solutions : Suivi chantiers, Devis-factures, Vitrine realisations, Gestion materiaux
- Themes : Charcoal Bronze, Sage Forest
- CTA → /wizard-societe.html?type=artisan_btp

### prothesistes.html
- Headline : "Votre laboratoire. Votre precision. Votre marque."
- Solutions : Gestion cas, Portail dentistes, Tarification auto, Stock materiaux
- Themes : Rose Porcelain, Clinical White
- CTA → /wizard-societe.html?type=profession_liberale&sous_type=prothesiste

### sci.html
- Headline : "Votre patrimoine. Sous controle. Toujours."
- Solutions : Gestion biens, Suivi financier, Documents juridiques, Espace associes
- Themes : Navy Saffron, Ivory Gold
- CTA → /wizard-societe.html?type=sci

### createurs.html
- Headline : "Vos creations. Votre univers. Votre boutique."
- Solutions : Portfolio premium, Boutique integree, Stock creations, Analytics
- Themes : Royal Purple, Rose Porcelain
- CTA → /wizard-societe.html?type=createur

## VISUELS

### Mockups SVG inline
Pour les screenshots dashboards, creer des SVG stylises inline :
- Charte JADOMI (noir + accent metier)
- Features reelles (KPIs, listes, cards)
- Animes (pulse, fade, progress bar)
- <10 KB chacun

### Script generation DALL-E 3 (optionnel, Karim lance manuellement)
Creer /scripts/generate-landing-visuals.js qui genere hero images
et portraits temoignages pour chaque metier via DALL-E 3.
Cout : ~1.12€ total (14 images × 0.08€).

## NAVIGATION

Header fin en haut de chaque landing metier :
[Logo JADOMI]  Avocats . Dentistes . Coiffeurs . BTP . Prothesistes . SCI . Createurs  [Se connecter]
Metier courant en gras/souligne couleur accent.

## SEO

Chaque landing a :
- title adapte : "JADOMI pour Avocats — Site cabinet, RDV, espace client"
- meta description adaptee
- og:image hero du metier

## MISE A JOUR CODEX

Section 2.14, 6 (Passe 27), 7 (decision 14), 8 (roadmap), 10 (bugs)

## CONTRAINTES

- Vouvoiement premium partout
- 100% focused par audience — pas de mention autres metiers dans le corps
- Performance : <150 KB par landing (images WebP optimisees)
- Responsive mobile parfait
- Animations scroll-driven conservees de Passe 26

## TEMPS ESTIME : 6-8h Claude Code
