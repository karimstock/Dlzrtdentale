#!/bin/bash
# JADOMI — File integrity verification
BASELINE=$(ls -t /home/ubuntu/.jadomi-integrity-*.md5 2>/dev/null | head -1)
if [ -z "$BASELINE" ]; then
  echo "[INTEGRITY] Creation baseline..."
  cd /home/ubuntu/jadomi
  find api/ lib/ -name "*.js" -exec sha256sum {} \; | sort > /home/ubuntu/.jadomi-integrity-$(date +%Y%m%d).md5
  sha256sum server.js package.json >> /home/ubuntu/.jadomi-integrity-$(date +%Y%m%d).md5
  echo "[OK] Baseline creee: $(wc -l < /home/ubuntu/.jadomi-integrity-$(date +%Y%m%d).md5) fichiers"
  exit 0
fi

cd /home/ubuntu/jadomi
CURRENT="/tmp/jadomi-integrity-current.md5"
find api/ lib/ -name "*.js" -exec sha256sum {} \; | sort > "$CURRENT"
sha256sum server.js package.json >> "$CURRENT"

DIFF=$(diff "$BASELINE" "$CURRENT" 2>/dev/null)
if [ -n "$DIFF" ]; then
  echo "[ALERTE INTEGRITE] Fichiers modifies detectes — $(date)"
  echo "$DIFF"
else
  echo "[OK] Integrite verifiee — $(date)"
fi
rm -f "$CURRENT"
