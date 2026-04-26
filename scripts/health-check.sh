#!/bin/bash
# JADOMI — Health check monitoring (toutes les 5 min via cron)

JADOMI_URL="http://localhost:3001"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$JADOMI_URL/api/health" --max-time 10 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
  echo "[ALERTE] JADOMI ne repond pas (HTTP $HTTP_CODE) — $(date)"
  pm2 describe jadomi > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "[ACTION] PM2 start..."
    cd /home/ubuntu/jadomi && pm2 start server.js --name jadomi
  else
    PM2_STATUS=$(pm2 describe jadomi | grep status | awk '{print $4}')
    if [ "$PM2_STATUS" != "online" ]; then
      echo "[ACTION] PM2 reload..."
      pm2 reload jadomi
    fi
  fi
else
  MEM_USED=$(free -m | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
  if [ "$MEM_USED" -gt 90 ]; then
    echo "[WARN] Memoire a ${MEM_USED}% — $(date)"
  fi
  DISK_USED=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
  if [ "$DISK_USED" -gt 85 ]; then
    echo "[WARN] Disque a ${DISK_USED}% — $(date)"
  fi
fi
