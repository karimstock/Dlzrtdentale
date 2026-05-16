#!/bin/bash
# JADOMI — Surveille les scrapers et envoie email quand tout est fini
cd /home/ubuntu/jadomi

echo "[$(date)] Surveillance des scrapers lancee..."

while true; do
  DONE=0
  TOTAL=6

  for LOG in /tmp/gacd-rerun.log /tmp/mega-sitemap-rerun.log /tmp/doctorai-sitemap.log /tmp/dentaltix-sitemap.log /tmp/doctorstrong-vps.log /tmp/dentalclick-vps.log; do
    if [ -f "$LOG" ] && (grep -q "Termine" "$LOG" 2>/dev/null || grep -q "TERMINE" "$LOG" 2>/dev/null); then
      DONE=$((DONE + 1))
    fi
  done

  echo "[$(date)] $DONE/$TOTAL scrapers termines"

  if [ "$DONE" -eq "$TOTAL" ]; then
    echo "[$(date)] TOUS FINIS — envoi du rapport..."
    node scripts/notify-scrape-done.js
    echo "[$(date)] Rapport envoye!"
    exit 0
  fi

  # Verifier toutes les 10 minutes
  sleep 600
done
