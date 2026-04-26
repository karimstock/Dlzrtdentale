#!/bin/bash
# JADOMI — Backup automatique quotidien
# Usage: ./backup.sh [daily|weekly]
set -e

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
TYPE=${1:-daily}
JADOMI_DIR="/home/ubuntu/jadomi"

mkdir -p "$BACKUP_DIR/$TYPE"

echo "[JADOMI Backup] Debut: $(date)"

# 1. Backup du code source (sans node_modules)
tar czf "$BACKUP_DIR/$TYPE/jadomi-code-$DATE.tar.gz" \
  --exclude="node_modules" \
  --exclude=".git" \
  --exclude="uploads/staging" \
  --exclude="sites-clients" \
  -C /home/ubuntu jadomi/

echo "[OK] Code source sauvegarde"

# 2. Backup .env separement
if [ -f "$JADOMI_DIR/.env" ]; then
  cp "$JADOMI_DIR/.env" "$BACKUP_DIR/$TYPE/.env-$DATE"
  chmod 600 "$BACKUP_DIR/$TYPE/.env-$DATE"
  echo "[OK] .env sauvegarde"
fi

# 3. Backup PM2 config
pm2 save 2>/dev/null || true
if [ -f ~/.pm2/dump.pm2 ]; then
  cp ~/.pm2/dump.pm2 "$BACKUP_DIR/$TYPE/pm2-dump-$DATE.json"
  echo "[OK] PM2 config sauvegarde"
fi

# 4. Nettoyage vieux backups (garder 7 daily, 4 weekly)
if [ "$TYPE" = "daily" ]; then
  find "$BACKUP_DIR/daily" -name "*.tar.gz" -mtime +7 -delete 2>/dev/null
  find "$BACKUP_DIR/daily" -name ".env-*" -mtime +7 -delete 2>/dev/null
elif [ "$TYPE" = "weekly" ]; then
  find "$BACKUP_DIR/weekly" -name "*.tar.gz" -mtime +30 -delete 2>/dev/null
fi

# 5. Stats
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$TYPE/jadomi-code-$DATE.tar.gz" | cut -f1)
echo "[JADOMI Backup] Termine: $(date) — Taille: $BACKUP_SIZE"
