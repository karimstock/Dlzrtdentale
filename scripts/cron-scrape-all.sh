#!/bin/bash
# JADOMI — Cron hebdomadaire TOUS fournisseurs dentaires
# Chaque dimanche a 1h du matin (nuit, pas de ralentissement)
# crontab: 0 1 * * 0 /home/ubuntu/jadomi/scripts/cron-scrape-all.sh
cd /home/ubuntu/jadomi
DATE=$(date +%Y-%m-%d)
echo "=== JADOMI SCRAPE HEBDO — $DATE ==="

# Envoyer email debut
node -e "require('dotenv').config();require('./api/emailService').sendMail({to:'karim_bahmed@yahoo.fr',subject:'JADOMI Scrape hebdo DEMARRE — '+new Date().toLocaleDateString('fr-FR'),html:'<h2>Scraping hebdomadaire lance</h2><p>'+new Date().toLocaleString('fr-FR')+'</p><p>Tous les fournisseurs vont etre mis a jour cette nuit.</p>'})"

# ============ PHASE 1 : APIs FIABLES (rapide, pas de Puppeteer) ============

echo "[$(date)] GACD (API Algolia — fiable)..."
node scripts/scrape-gacd-algolia-v2.js > /tmp/gacd-$DATE.log 2>&1

echo "[$(date)] Venta Group : Doctor AI + Doctor Strong + Mega Dental (API Elasticsearch — fiable)..."
node scripts/scrape-venta-api.js --deep > /tmp/venta-api-$DATE.log 2>&1

echo "[$(date)] Henry Schein (API SearchAutoComplete — fiable)..."
node scripts/scrape-henryschein-api.js > /tmp/henryschein-$DATE.log 2>&1

echo "[$(date)] Multi-APIs : DentalRee + Dental-France + Polydentia (Shopify/WooCommerce)..."
node scripts/scrape-all-apis.js > /tmp/scrape-all-apis-$DATE.log 2>&1

echo "[$(date)] Dentaltix (JSON-LD sitemap — fiable)..."
node scripts/scrape-dentaltix-sitemap.js > /tmp/dentaltix-$DATE.log 2>&1

echo "[$(date)] DPI (sitemap + JSON-LD — fiable)..."
node scripts/scrape-dpi.js > /tmp/dpi-$DATE.log 2>&1

# ============ PHASE 2 : PUPPETEER (plus lent, peut casser) ============

echo "[$(date)] Mega Dental (sitemap fallback)..."
node scripts/mega-sitemap-scrape.js > /tmp/mega-sitemap-$DATE.log 2>&1

echo "[$(date)] Promodentaire..."
node scripts/scrape-promodentaire-vps.js > /tmp/promodentaire-$DATE.log 2>&1

# ============ REVENDEURS DISCOUNT ============

echo "[$(date)] DentalGoodDeal..."
node scripts/scrape-generic-vps.js dentalgooddeal https://www.dentalgooddeal.com "/recherche?controller=search&s=" > /tmp/dentalgooddeal-$DATE.log 2>&1

echo "[$(date)] DentalGoodDeal Pro..."
node scripts/scrape-generic-vps.js dentalgooddeal-pro https://dentalgooddeal.fr "/recherche?controller=search&s=" > /tmp/dentalgooddeal-pro-$DATE.log 2>&1

echo "[$(date)] Discount Dentaire..."
node scripts/scrape-generic-vps.js discountdentaire https://www.discount-dentaire.fr "/recherche?controller=search&s=" > /tmp/discountdentaire-$DATE.log 2>&1

echo "[$(date)] Top Dentaire..."
node scripts/scrape-generic-vps.js topdentaire https://www.topdentaire.fr "/recherche?controller=search&s=" > /tmp/topdentaire-$DATE.log 2>&1

echo "[$(date)] Dentalprive..."
node scripts/scrape-generic-vps.js dentalprive https://www.dentalprive.fr "/recherche?controller=search&s=" > /tmp/dentalprive-$DATE.log 2>&1

# ============ SPECIALISTES ============

echo "[$(date)] DPI Dental..."
node scripts/scrape-generic-vps.js dpidental https://www.dpidental.fr "/recherche?controller=search&s=" > /tmp/dpidental-$DATE.log 2>&1

echo "[$(date)] Dental Promotion..."
node scripts/scrape-generic-vps.js dentalpromotion https://www.dentalpromotion.fr "/recherche?controller=search&s=" > /tmp/dentalpromotion-$DATE.log 2>&1

echo "[$(date)] Dental Achat..."
node scripts/scrape-generic-vps.js dentalachat https://dentalachat.com "/recherche?controller=search&s=" > /tmp/dentalachat-$DATE.log 2>&1

echo "[$(date)] Omnium Dentaire..."
node scripts/scrape-generic-vps.js omniumdentaire https://www.omniumdentaire.com "/recherche?controller=search&s=" > /tmp/omniumdentaire-$DATE.log 2>&1

echo "[$(date)] CAP Dentaire..."
node scripts/scrape-generic-vps.js capdentaire https://www.capdentaire.com "/recherche?controller=search&s=" > /tmp/capdentaire-$DATE.log 2>&1

echo "[$(date)] DSM Dentaire..."
node scripts/scrape-generic-vps.js dsmdentaire https://dsmdentaire.com "/recherche?controller=search&s=" > /tmp/dsmdentaire-$DATE.log 2>&1

echo "[$(date)] B2B Dental..."
node scripts/scrape-generic-vps.js b2bdental https://www.b2b-dental.com "/recherche?controller=search&s=" > /tmp/b2bdental-$DATE.log 2>&1

echo "[$(date)] Dental France..."
node scripts/scrape-generic-vps.js dentalfrance https://www.dental-france.fr "/recherche?controller=search&s=" > /tmp/dentalfrance-$DATE.log 2>&1

echo "[$(date)] EDD Online..."
node scripts/scrape-generic-vps.js eddonline https://www.eddonline.fr "/recherche?controller=search&s=" > /tmp/eddonline-$DATE.log 2>&1

echo "[$(date)] Fournisseur Dentaire..."
node scripts/scrape-generic-vps.js fournisseurdentaire https://www.fournisseurdentaire.com "/recherche?controller=search&s=" > /tmp/fournisseurdentaire-$DATE.log 2>&1

echo "[$(date)] Go Dentaire..."
node scripts/scrape-generic-vps.js godentaire https://www.go-dentaire.com "/recherche?controller=search&s=" > /tmp/godentaire-$DATE.log 2>&1

echo "[$(date)] DextaShop..."
node scripts/scrape-generic-vps.js dextashop https://dextashop.com "/recherche?controller=search&s=" > /tmp/dextashop-$DATE.log 2>&1

echo "[$(date)] E-DentalMarket..."
node scripts/scrape-generic-vps.js edentalmarket https://e-dentalmarket.fr "/recherche?controller=search&s=" > /tmp/edentalmarket-$DATE.log 2>&1

echo "[$(date)] Praxisdienst..."
node scripts/scrape-generic-vps.js praxisdienst https://www.praxisdienst.com/fr-fr/dentaire "/search?sSearch=" > /tmp/praxisdienst-$DATE.log 2>&1

echo "[$(date)] DentRmed..."
node scripts/scrape-generic-vps.js dentrmed https://www.dentrmed.com "/recherche?controller=search&s=" > /tmp/dentrmed-$DATE.log 2>&1

echo "[$(date)] DBI Dental..."
node scripts/scrape-generic-vps.js dbidental https://www.dbidental.fr "/recherche?controller=search&s=" > /tmp/dbidental-$DATE.log 2>&1

echo "[$(date)] Dental Services..."
node scripts/scrape-generic-vps.js dentalservices https://dental-services.fr "/recherche?controller=search&s=" > /tmp/dentalservices-$DATE.log 2>&1

echo "[$(date)] Dental Express..."
node scripts/scrape-generic-vps.js dentalexpress https://www.dental-express.fr "/recherche?controller=search&s=" > /tmp/dentalexpress-$DATE.log 2>&1

# ============ FABRICANTS VENTE DIRECTE ============

echo "[$(date)] Septodont..."
node scripts/scrape-generic-vps.js septodont https://www.septodont.fr "/search?q=" > /tmp/septodont-$DATE.log 2>&1

echo "[$(date)] Biotech Dental..."
node scripts/scrape-generic-vps.js biotechdental https://www.biotech-dental.com "/recherche?controller=search&s=" > /tmp/biotechdental-$DATE.log 2>&1

# Envoyer email final
echo "[$(date)] SCRAPE HEBDO TERMINE"
node scripts/notify-scrape-done.js

echo "=== FIN — $(date) ==="
