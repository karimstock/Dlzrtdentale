#!/bin/bash
# =============================================
# JADOMI — Script de préparation migration HDS
# Étape 1 : Backup complet du serveur actuel
# À exécuter sur le serveur ACTUEL (141.94.10.182)
# =============================================

set -e
echo "╔══════════════════════════════════════════════╗"
echo "║  JADOMI — Backup complet pour migration HDS  ║"
echo "╚══════════════════════════════════════════════╝"

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/home/ubuntu/migration-backup-${DATE}"

mkdir -p "$BACKUP_DIR"
echo "[1/7] Dossier backup : $BACKUP_DIR"

# 1. Code JADOMI (sans node_modules ni .git)
echo "[2/7] Backup code JADOMI..."
rsync -a --exclude='node_modules' --exclude='.git' --exclude='*.bak*' \
  /home/ubuntu/jadomi/ "$BACKUP_DIR/jadomi/"
echo "  → $(du -sh $BACKUP_DIR/jadomi/ | cut -f1)"

# 2. Fichier .env (CRITIQUE — contient toutes les clés)
echo "[3/7] Backup .env..."
cp /home/ubuntu/jadomi/.env "$BACKUP_DIR/jadomi/.env"
echo "  → .env copié"

# 3. Uploads (fichiers utilisateurs)
echo "[4/7] Backup uploads..."
if [ -d /home/ubuntu/jadomi/uploads ]; then
  cp -r /home/ubuntu/jadomi/uploads "$BACKUP_DIR/uploads/"
  echo "  → $(du -sh $BACKUP_DIR/uploads/ | cut -f1)"
fi

# 4. Studio generated (flyers, vidéos, images)
echo "[5/7] Backup Studio generated..."
if [ -d /home/ubuntu/jadomi/public/studio/generated ]; then
  cp -r /home/ubuntu/jadomi/public/studio/generated "$BACKUP_DIR/studio-generated/"
  echo "  → $(du -sh $BACKUP_DIR/studio-generated/ | cut -f1)"
fi

# 5. Config Nginx
echo "[6/7] Backup Nginx..."
sudo cp -r /etc/nginx/sites-available "$BACKUP_DIR/nginx-sites/"
sudo cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/nginx-enabled/"
sudo cp /etc/nginx/nginx.conf "$BACKUP_DIR/nginx.conf"
echo "  → Nginx copié"

# 6. Crontabs
echo "[7/7] Backup crontabs..."
crontab -l > "$BACKUP_DIR/crontab-ubuntu.txt" 2>/dev/null || echo "  Pas de crontab"
sudo crontab -l > "$BACKUP_DIR/crontab-root.txt" 2>/dev/null || echo "  Pas de crontab root"

# 7. Liste des paquets installés
dpkg --get-selections > "$BACKUP_DIR/packages-list.txt"
npm list -g --depth=0 > "$BACKUP_DIR/npm-global.txt" 2>/dev/null

# Résumé
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  BACKUP TERMINÉ                       ║"
echo "╠══════════════════════════════════════╣"
echo "  Taille totale : $(du -sh $BACKUP_DIR | cut -f1)"
echo "  Emplacement   : $BACKUP_DIR"
echo ""
echo "  Prochaine étape :"
echo "  → Commander le serveur OVH HDS"
echo "  → Recevoir l'IP + mot de passe root"
echo "  → Lancer 02-setup-new-server.sh"
echo "╚══════════════════════════════════════╝"
