#!/bin/bash
# =============================================
# JADOMI — Transfert données vers nouveau serveur
# Étape 3 : À exécuter sur l'ANCIEN serveur (141.94.10.182)
# Usage : ./03-transfer-data.sh NOUVELLE_IP
# =============================================

set -e
NEW_IP="${1}"

if [ -z "$NEW_IP" ]; then
  echo "Usage: ./03-transfer-data.sh NOUVELLE_IP"
  echo "Ex:    ./03-transfer-data.sh 51.210.xxx.xxx"
  exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  JADOMI — Transfert vers $NEW_IP              "
echo "╚══════════════════════════════════════════════╝"

# ═══ 1. Code JADOMI (sans node_modules, sans .git volumineux) ═══
echo "[1/6] Transfert code JADOMI..."
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.bak*' \
  --exclude='*.bak-*' \
  /home/ubuntu/jadomi/ ubuntu@${NEW_IP}:/home/ubuntu/jadomi/
echo "  → Code transféré"

# ═══ 2. Fonts ═══
echo "[2/6] Transfert fonts..."
rsync -avz /usr/local/share/fonts/jadomi/ ubuntu@${NEW_IP}:/tmp/jadomi-fonts/
ssh ubuntu@${NEW_IP} "sudo cp /tmp/jadomi-fonts/*.ttf /usr/local/share/fonts/jadomi/ 2>/dev/null; sudo fc-cache -f"
echo "  → Fonts installées"

# ═══ 3. Config Nginx ═══
echo "[3/6] Transfert config Nginx..."
sudo rsync -avz /etc/nginx/sites-available/ ubuntu@${NEW_IP}:/tmp/nginx-sites/
ssh ubuntu@${NEW_IP} "sudo cp /tmp/nginx-sites/* /etc/nginx/sites-available/"
echo "  → Nginx transféré (penser à modifier l'IP dans les configs)"

# ═══ 4. Crontabs ═══
echo "[4/6] Transfert crontabs..."
crontab -l > /tmp/crontab-backup.txt 2>/dev/null
scp /tmp/crontab-backup.txt ubuntu@${NEW_IP}:/tmp/
ssh ubuntu@${NEW_IP} "crontab /tmp/crontab-backup.txt"
echo "  → Crontabs transférées"

# ═══ 5. npm install sur le nouveau serveur ═══
echo "[5/6] Installation dépendances npm sur nouveau serveur..."
ssh ubuntu@${NEW_IP} "cd /home/ubuntu/jadomi && npm install --production"
echo "  → npm install terminé"

# ═══ 6. Vérification ═══
echo "[6/6] Vérifications..."
ssh ubuntu@${NEW_IP} "cd /home/ubuntu/jadomi && node -c server.js && echo 'server.js OK'"
ssh ubuntu@${NEW_IP} "cd /home/ubuntu/jadomi && node -c lib/ia-router.js && echo 'ia-router OK'"
ssh ubuntu@${NEW_IP} "cd /home/ubuntu/jadomi && node -c lib/ai-studio/jadomi-brain.js && echo 'brain OK'"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  TRANSFERT TERMINÉ                     ║"
echo "╠══════════════════════════════════════╣"
echo ""
echo "  Prochaine étape :"
echo "  → ssh ubuntu@${NEW_IP}"
echo "  → Lancer 04-go-live.sh"
echo "╚══════════════════════════════════════╝"
