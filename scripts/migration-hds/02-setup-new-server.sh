#!/bin/bash
# =============================================
# JADOMI — Installation nouveau serveur HDS
# Étape 2 : À exécuter sur le NOUVEAU serveur OVH
# Connecte-toi en SSH : ssh root@NOUVELLE_IP
# =============================================

set -e
echo "╔══════════════════════════════════════════════╗"
echo "║  JADOMI — Setup nouveau serveur HDS           ║"
echo "╚══════════════════════════════════════════════╝"

# ═══ 1. Mise à jour système ═══
echo "[1/12] Mise à jour système..."
apt update && apt upgrade -y

# ═══ 2. Créer utilisateur ubuntu ═══
echo "[2/12] Création utilisateur ubuntu..."
if ! id -u ubuntu >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" ubuntu
  usermod -aG sudo ubuntu
  echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/ubuntu
  mkdir -p /home/ubuntu/.ssh
  cp ~/.ssh/authorized_keys /home/ubuntu/.ssh/ 2>/dev/null || true
  chown -R ubuntu:ubuntu /home/ubuntu/.ssh
fi

# ═══ 3. Node.js 20 LTS ═══
echo "[3/12] Installation Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "  Node $(node -v), npm $(npm -v)"

# ═══ 4. PM2 ═══
echo "[4/12] Installation PM2..."
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# ═══ 5. Nginx ═══
echo "[5/12] Installation Nginx..."
apt install -y nginx
systemctl enable nginx

# ═══ 6. Certbot (SSL Let's Encrypt) ═══
echo "[6/12] Installation Certbot..."
apt install -y certbot python3-certbot-nginx

# ═══ 7. Ollama ═══
echo "[7/12] Installation Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh
echo "  Ollama installé"

# ═══ 8. Modèles IA locaux ═══
echo "[8/12] Téléchargement modèles IA (peut prendre 30 min)..."
ollama pull llama3.1:70b &
LLAMA_PID=$!
ollama pull qwen2.5:14b &
QWEN_PID=$!
ollama pull mistral:7b &
MISTRAL_PID=$!
echo "  3 téléchargements en parallèle (llama 70B + qwen 14B + mistral 7B)"
echo "  Attente..."
wait $LLAMA_PID $QWEN_PID $MISTRAL_PID
echo "  Modèles installés :"
ollama list

# ═══ 9. Outils système ═══
echo "[9/12] Installation outils..."
apt install -y git build-essential pdftotext imagemagick poppler-utils \
  fonts-liberation fonts-noto ufw fail2ban docker.io

# ═══ 10. Fonts JADOMI ═══
echo "[10/12] Installation fonts..."
mkdir -p /usr/local/share/fonts/jadomi
# Les fonts seront copiées avec le code

# ═══ 11. Firewall ═══
echo "[11/12] Configuration firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 11434/tcp # Ollama (localhost only)
ufw --force enable

# ═══ 12. Sécurité SSH ═══
echo "[12/12] Sécurité SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart sshd

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  SETUP TERMINÉ                        ║"
echo "╠══════════════════════════════════════╣"
echo "  Node    : $(node -v)"
echo "  PM2     : $(pm2 -v)"
echo "  Nginx   : $(nginx -v 2>&1 | cut -d/ -f2)"
echo "  Ollama  : installé"
echo "  Modèles : $(ollama list | wc -l) installés"
echo ""
echo "  Prochaine étape :"
echo "  → Lancer 03-transfer-data.sh depuis l'ANCIEN serveur"
echo "╚══════════════════════════════════════╝"
