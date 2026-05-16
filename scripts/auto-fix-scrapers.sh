#!/bin/bash
# JADOMI — Auto-correcteur de scrapers
# Verifie les scrapers, relance ceux qui ont echoue
cd /home/ubuntu/jadomi

echo "[$(date)] === AUTO-FIX SCRAPERS ==="

# Fonction: relancer un scraper s'il a echoue ou n'est pas en cours
relaunch() {
  local NAME=$1
  local LOG=$2
  local CMD=$3

  # Verifier si deja en cours
  if pgrep -f "$NAME" > /dev/null 2>&1; then
    echo "[$(date)] $NAME: en cours, on touche pas"
    return
  fi

  # Verifier si termine avec succes
  if [ -f "$LOG" ] && grep -q "TERMINE\|Termine\|Import:" "$LOG" 2>/dev/null; then
    local count=$(grep -oP 'total=\d+|=\d+|TERMINE: \d+' "$LOG" | tail -1 | grep -oP '\d+')
    if [ "$count" -gt "0" ] 2>/dev/null; then
      echo "[$(date)] $NAME: OK ($count produits)"
      return
    fi
  fi

  echo "[$(date)] $NAME: RELANCE..."
  eval "nohup $CMD > $LOG 2>&1 &"
  echo "[$(date)] $NAME: relance (PID $!)"
}

# Distributeurs principaux
relaunch "scrape-gacd" "/tmp/gacd-rerun.log" "node scripts/scrape-gacd.js"
relaunch "mega-sitemap-scrape" "/tmp/mega-sitemap-rerun.log" "node scripts/mega-sitemap-scrape.js"
relaunch "scrape-doctorai-sitemap" "/tmp/doctorai-sitemap.log" "node scripts/scrape-doctorai-sitemap.js"
relaunch "scrape-dentaltix-sitemap" "/tmp/dentaltix-sitemap.log" "node scripts/scrape-dentaltix-sitemap.js"
relaunch "scrape-doctorstrong-vps" "/tmp/doctorstrong-vps.log" "node scripts/scrape-doctorstrong-vps.js"
relaunch "scrape-dentalclick-vps" "/tmp/dentalclick-vps.log" "node scripts/scrape-dentalclick-vps.js"
relaunch "scrape-henryschein-vps" "/tmp/henryschein-vps.log" "node scripts/scrape-henryschein-vps.js"
relaunch "scrape-promodentaire-vps" "/tmp/promodentaire-vps.log" "node scripts/scrape-promodentaire-vps.js"

# Envoyer rapport
node scripts/notify-scrape-done.js

echo "[$(date)] === AUTO-FIX TERMINE ==="
