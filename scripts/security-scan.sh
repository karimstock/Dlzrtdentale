#!/bin/bash
# ===================================================================
# JADOMI — Scan securite nocturne automatique
# Execute chaque nuit a 2h du matin via cron
# Scan antivirus (ClamAV) + rootkits (rkhunter) + integrite fichiers
# Rapport envoye sur le dashboard JADOMI
# ===================================================================
set -e

LOG_DIR="/home/ubuntu/backups/security"
DATE=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$LOG_DIR/security-report-$DATE.json"
JADOMI_DIR="/home/ubuntu/jadomi"
JADOMI_URL="http://localhost:3001"

mkdir -p "$LOG_DIR"

echo "[SECURITE JADOMI] Scan nocturne debut: $(date)"

# ===========================
# 1. SCAN ANTIVIRUS (ClamAV)
# ===========================
AV_RESULT="clean"
AV_INFECTED=0
AV_SCANNED=0

if command -v clamscan &> /dev/null; then
  # Mise a jour des signatures (si freshclam n'est pas deja en cours)
  sudo freshclam --quiet 2>/dev/null || true

  # Scan complet du repertoire JADOMI (exclure node_modules)
  AV_OUTPUT=$(clamscan -r --exclude-dir="node_modules" --exclude-dir=".git" --exclude-dir="backups" "$JADOMI_DIR" 2>&1)
  AV_INFECTED=$(echo "$AV_OUTPUT" | grep "Infected files:" | awk '{print $3}')
  AV_SCANNED=$(echo "$AV_OUTPUT" | grep "Scanned files:" | awk '{print $3}')

  if [ "$AV_INFECTED" -gt 0 ] 2>/dev/null; then
    AV_RESULT="INFECTED"
    echo "[ALERTE] $AV_INFECTED fichiers infectes detectes!"
    # Quarantaine automatique
    mkdir -p "$LOG_DIR/quarantine"
    echo "$AV_OUTPUT" | grep "FOUND" | while read line; do
      INFECTED_FILE=$(echo "$line" | cut -d: -f1)
      echo "[QUARANTAINE] $INFECTED_FILE"
      mv "$INFECTED_FILE" "$LOG_DIR/quarantine/" 2>/dev/null || true
    done
  else
    AV_RESULT="clean"
    echo "[OK] Antivirus: $AV_SCANNED fichiers scannes, 0 infecte"
  fi
else
  AV_RESULT="clamav_not_installed"
  echo "[WARN] ClamAV non installe"
fi

# Scan /tmp et /var/tmp
TMP_SUSPICIOUS=$(find /tmp /var/tmp /dev/shm -type f -executable 2>/dev/null | wc -l)

# ===========================
# 2. SCAN ROOTKITS (rkhunter)
# ===========================
RK_RESULT="clean"
RK_WARNINGS=0

if command -v rkhunter &> /dev/null; then
  sudo rkhunter --check --skip-keypress --report-warnings-only --quiet 2>/dev/null > "$LOG_DIR/rkhunter-$DATE.log" || true
  RK_WARNINGS=$(grep -c "Warning:" "$LOG_DIR/rkhunter-$DATE.log" 2>/dev/null || echo "0")
  if [ "$RK_WARNINGS" -gt 0 ]; then
    RK_RESULT="warnings"
  fi
  echo "[OK] Rootkit scan: $RK_WARNINGS avertissements"
else
  RK_RESULT="rkhunter_not_installed"
fi

# ===========================
# 3. INTEGRITE FICHIERS
# ===========================
INTEGRITY_RESULT="clean"
INTEGRITY_CHANGES=0
BASELINE=$(ls -t /home/ubuntu/.jadomi-integrity-*.md5 2>/dev/null | head -1)

if [ -n "$BASELINE" ]; then
  cd "$JADOMI_DIR"
  CURRENT="/tmp/jadomi-integrity-check-$DATE.md5"
  find api/ lib/ -name "*.js" -exec md5sum {} \; | sort > "$CURRENT"
  md5sum server.js package.json >> "$CURRENT"

  DIFF=$(diff "$BASELINE" "$CURRENT" 2>/dev/null || true)
  if [ -n "$DIFF" ]; then
    INTEGRITY_CHANGES=$(echo "$DIFF" | grep "^[<>]" | wc -l)
    INTEGRITY_RESULT="modified"
    echo "[INFO] Integrite: $INTEGRITY_CHANGES changements depuis baseline"
  else
    echo "[OK] Integrite: aucune modification non autorisee"
  fi
  rm -f "$CURRENT"
fi

# ===========================
# 4. SCAN RESEAU + PROCESSUS
# ===========================
SUSPICIOUS_PORTS=$(ss -tlnp | grep -v -E "(22|80|443|3001|5432|53|127\.0\.0\.1)" | wc -l)
SUSPICIOUS_PROCS=$(ps aux | grep -iE "(mine|xmr|monero|nc -l|ncat|socat)" | grep -v grep | wc -l)
FAILED_SSH=$(journalctl -u ssh --since "24 hours ago" 2>/dev/null | grep -c "Failed password" || echo "0")

# ===========================
# 5. UTILISATION RESSOURCES
# ===========================
MEM_USED=$(free -m | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
DISK_USED=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
CPU_LOAD=$(uptime | awk -F'load average: ' '{print $2}' | cut -d, -f1 | xargs)

# ===========================
# 6. GENERER RAPPORT JSON
# ===========================
cat > "$REPORT_FILE" << EOJSON
{
  "date": "$(date -Iseconds)",
  "type": "security_scan",
  "antivirus": {
    "status": "$AV_RESULT",
    "fichiers_scannes": $AV_SCANNED,
    "fichiers_infectes": $AV_INFECTED
  },
  "rootkit": {
    "status": "$RK_RESULT",
    "avertissements": $RK_WARNINGS
  },
  "integrite": {
    "status": "$INTEGRITY_RESULT",
    "changements": $INTEGRITY_CHANGES,
    "fichiers_surveilles": $(wc -l < "$BASELINE" 2>/dev/null || echo "0")
  },
  "reseau": {
    "ports_suspects": $SUSPICIOUS_PORTS,
    "processus_suspects": $SUSPICIOUS_PROCS,
    "tentatives_ssh_echouees_24h": $FAILED_SSH,
    "executables_tmp": $TMP_SUSPICIOUS
  },
  "ressources": {
    "memoire_pct": $MEM_USED,
    "disque_pct": $DISK_USED,
    "cpu_load": "$CPU_LOAD"
  },
  "score_securite": $(
    SCORE=100
    [ "$AV_INFECTED" -gt 0 ] && SCORE=$((SCORE - 50))
    [ "$RK_WARNINGS" -gt 0 ] && SCORE=$((SCORE - 20))
    [ "$SUSPICIOUS_PORTS" -gt 0 ] && SCORE=$((SCORE - 15))
    [ "$SUSPICIOUS_PROCS" -gt 0 ] && SCORE=$((SCORE - 30))
    [ "$FAILED_SSH" -gt 100 ] && SCORE=$((SCORE - 10))
    [ "$MEM_USED" -gt 90 ] && SCORE=$((SCORE - 5))
    [ "$DISK_USED" -gt 85 ] && SCORE=$((SCORE - 5))
    echo "$SCORE"
  )
}
EOJSON

echo "[OK] Rapport genere: $REPORT_FILE"

# ===========================
# 7. ENVOYER AU DASHBOARD
# ===========================
# POST le rapport au dashboard JADOMI pour affichage admin
curl -s -X POST "$JADOMI_URL/api/admin/security-report" \
  -H "Content-Type: application/json" \
  -d @"$REPORT_FILE" 2>/dev/null || echo "[WARN] Dashboard non joignable"

# ===========================
# 8. NETTOYAGE VIEUX RAPPORTS (garder 30 jours)
# ===========================
find "$LOG_DIR" -name "security-report-*.json" -mtime +30 -delete 2>/dev/null
find "$LOG_DIR" -name "rkhunter-*.log" -mtime +30 -delete 2>/dev/null

echo "[SECURITE JADOMI] Scan termine: $(date)"
echo "Score securite: $(cat "$REPORT_FILE" | grep score_securite | awk -F: '{print $2}' | tr -d ' ,')/100"
