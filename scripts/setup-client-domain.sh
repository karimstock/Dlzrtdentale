#!/bin/bash
# =============================================
# JADOMI — Setup domaine client
# Configure Nginx vhost + SSL Let's Encrypt
# Usage : sudo bash scripts/setup-client-domain.sh cabinet-dupont.fr mon-slug
# =============================================

set -e

DOMAIN="$1"
SLUG="$2"
VPS_IP="141.94.10.182"
SITES_DIR="/home/ubuntu/jadomi/sites-clients"
NGINX_SITES="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

if [ -z "$DOMAIN" ] || [ -z "$SLUG" ]; then
  echo "Usage: sudo bash $0 <domain> <slug>"
  echo "Exemple: sudo bash $0 cabinet-dupont.fr cabinet-dupont"
  exit 1
fi

echo "=== JADOMI — Configuration domaine client ==="
echo "Domaine : $DOMAIN"
echo "Slug    : $SLUG"
echo "Dossier : $SITES_DIR/$SLUG"

# 1. Vérifier que le dossier du site existe
if [ ! -d "$SITES_DIR/$SLUG" ]; then
  echo "[WARN] Dossier $SITES_DIR/$SLUG absent, création..."
  mkdir -p "$SITES_DIR/$SLUG"
fi

# 2. Créer la config Nginx
NGINX_CONF="$NGINX_SITES/$DOMAIN"

cat > "$NGINX_CONF" <<NGINX_EOF
# JADOMI — Site client : $DOMAIN
# Généré automatiquement le $(date '+%Y-%m-%d %H:%M')

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Redirection HTTPS (activée après certbot)
    # return 301 https://\$host\$request_uri;

    root $SITES_DIR/$SLUG;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache assets statiques
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff2|woff|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Sécurité headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logs
    access_log /var/log/nginx/${DOMAIN}_access.log;
    error_log /var/log/nginx/${DOMAIN}_error.log;
}
NGINX_EOF

echo "[OK] Config Nginx créée : $NGINX_CONF"

# 3. Activer le site
if [ ! -L "$NGINX_ENABLED/$DOMAIN" ]; then
  ln -s "$NGINX_CONF" "$NGINX_ENABLED/$DOMAIN"
  echo "[OK] Site activé"
fi

# 4. Tester la config Nginx
nginx -t
echo "[OK] Config Nginx valide"

# 5. Recharger Nginx
systemctl reload nginx
echo "[OK] Nginx rechargé"

# 6. SSL Let's Encrypt (si le DNS est déjà propagé)
echo ""
echo "=== SSL Let's Encrypt ==="
echo "Tentative d'obtention du certificat SSL..."

if certbot certonly --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email contact@jadomi.fr 2>/dev/null; then
  echo "[OK] Certificat SSL obtenu"

  # Mettre à jour la config Nginx pour HTTPS
  cat > "$NGINX_CONF" <<NGINX_SSL_EOF
# JADOMI — Site client : $DOMAIN (HTTPS)
# Généré automatiquement le $(date '+%Y-%m-%d %H:%M')

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root $SITES_DIR/$SLUG;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache assets statiques
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff2|woff|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Sécurité headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log /var/log/nginx/${DOMAIN}_access.log;
    error_log /var/log/nginx/${DOMAIN}_error.log;
}
NGINX_SSL_EOF

  nginx -t && systemctl reload nginx
  echo "[OK] HTTPS activé pour $DOMAIN"
else
  echo "[WARN] SSL pas encore possible (DNS pas propagé). Réessayez plus tard :"
  echo "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo ""
echo "=== TERMINÉ ==="
echo "Site accessible sur : http://$DOMAIN"
echo "Dossier : $SITES_DIR/$SLUG"
