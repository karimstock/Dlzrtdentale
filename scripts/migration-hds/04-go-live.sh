#!/bin/bash
# =============================================
# JADOMI — Mise en production nouveau serveur HDS
# Étape 4 : À exécuter sur le NOUVEAU serveur
# =============================================

set -e
echo "╔══════════════════════════════════════════════╗"
echo "║  JADOMI — Go Live sur serveur HDS             ║"
echo "╚══════════════════════════════════════════════╝"

cd /home/ubuntu/jadomi

# ═══ 1. Vérifier le .env ═══
echo "[1/10] Vérification .env..."
if [ ! -f .env ]; then
  echo "  ERREUR : .env manquant ! Copie depuis l'ancien serveur."
  exit 1
fi
grep -q "SUPABASE_URL" .env && echo "  → Supabase OK" || echo "  ATTENTION : SUPABASE_URL manquant"
grep -q "ANTHROPIC_API_KEY" .env && echo "  → Anthropic OK" || echo "  ATTENTION : ANTHROPIC_API_KEY manquant"
grep -q "SMTP_PASS" .env && echo "  → SMTP OK" || echo "  ATTENTION : SMTP_PASS manquant"

# ═══ 2. Syntax check serveur ═══
echo "[2/10] Syntax check..."
node -c server.js && echo "  → server.js OK"
node -c lib/ia-router.js && echo "  → ia-router OK"
node -c lib/ai-studio/jadomi-brain.js && echo "  → brain OK"
node -c lib/ai-studio/data-guard.js && echo "  → data-guard OK"

# ═══ 3. Vérifier Ollama ═══
echo "[3/10] Vérification Ollama..."
systemctl is-active ollama >/dev/null && echo "  → Ollama actif" || { echo "  Démarrage Ollama..."; systemctl start ollama; sleep 3; }
ollama list
echo "  → Modèles disponibles"

# ═══ 4. Test rapide Llama 70B ═══
echo "[4/10] Test Llama 70B..."
RESULT=$(curl -s http://localhost:11434/api/generate -d '{"model":"llama3.1:70b","prompt":"Dis bonjour en français, 1 phrase.","stream":false}' 2>/dev/null | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).response)}catch(e){console.log('ERREUR')}})")
echo "  → Llama 70B : $RESULT"

# ═══ 5. Configurer ia-router pour Llama 70B ═══
echo "[5/10] Configuration ia-router pour Llama 70B..."
sed -i "s/const OLLAMA_MODEL = 'qwen2.5:14b'/const OLLAMA_MODEL = 'llama3.1:70b'/" lib/ia-router.js
sed -i "s/const OLLAMA_MODEL_FAST = 'mistral:7b'/const OLLAMA_MODEL_FAST = 'qwen2.5:14b'/" lib/ia-router.js
node -c lib/ia-router.js && echo "  → ia-router mis à jour : Llama 70B principal, Qwen 14B rapide"

# ═══ 6. Configurer Nginx ═══
echo "[6/10] Configuration Nginx..."
sudo ln -sf /etc/nginx/sites-available/jadomi /etc/nginx/sites-enabled/
sudo nginx -t && echo "  → Nginx config OK" || echo "  ERREUR Nginx !"

# ═══ 7. SSL Let's Encrypt ═══
echo "[7/10] Certificat SSL..."
echo "  → APRÈS le changement DNS, lancer :"
echo "    sudo certbot --nginx -d jadomi.fr -d www.jadomi.fr -d jadomi.be"
echo "  (pas maintenant — le DNS pointe encore vers l'ancien serveur)"

# ═══ 8. Démarrer PM2 ═══
echo "[8/10] Démarrage PM2..."
pm2 start server.js --name jadomi --max-memory-restart 4G
pm2 save
echo "  → PM2 démarré"

# ═══ 9. Test santé ═══
echo "[9/10] Health check..."
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "  → JADOMI répond : HTTP $HTTP_CODE ✓"
else
  echo "  ATTENTION : HTTP $HTTP_CODE — vérifier les logs : pm2 logs jadomi"
fi

# ═══ 10. Test API ═══
echo "[10/10] Test APIs..."
curl -s http://localhost:3001/api/studio/flyer/themes | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log('  → API themes:',j.ok?'OK ('+j.themes.length+' thèmes)':'ERREUR')}catch(e){console.log('  → ERREUR API')}})"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  SERVEUR HDS PRÊT                                     ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                        ║"
echo "║  Prochaines étapes MANUELLES :                         ║"
echo "║                                                        ║"
echo "║  1. Aller sur OVH Panel → Zone DNS jadomi.fr           ║"
echo "║  2. Modifier l'enregistrement A :                      ║"
echo "║     jadomi.fr → NOUVELLE_IP (remplacer 141.94.10.182)  ║"
echo "║  3. Même chose pour jadomi.be si utilisé               ║"
echo "║  4. Attendre 2-48h de propagation DNS                  ║"
echo "║  5. Quand DNS propagé, lancer :                        ║"
echo "║     sudo certbot --nginx -d jadomi.fr -d www.jadomi.fr ║"
echo "║  6. Tester https://jadomi.fr dans le navigateur        ║"
echo "║  7. Si tout OK → couper l'ancien serveur               ║"
echo "║                                                        ║"
echo "║  GARDER L'ANCIEN SERVEUR 7 JOURS en parallèle         ║"
echo "║  (au cas où il faut rollback)                          ║"
echo "║                                                        ║"
echo "╚══════════════════════════════════════════════════════╝"
