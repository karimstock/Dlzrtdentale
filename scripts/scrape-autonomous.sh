#!/bin/bash
# =============================================
# JADOMI — Scraper Autonome
# Tourne tout seul, envoie des rapports par email
# Usage: nohup bash scripts/scrape-autonomous.sh &
# =============================================

cd /home/ubuntu/jadomi
LOG="/tmp/scrape-autonomous.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

send_report() {
  local subject="$1"
  local body="$2"

  node -e "
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'pro2.mail.ovh.net',
    port: 587, secure: false,
    auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' }
  });
  transporter.sendMail({
    from: 'JADOMI Scraper <noreply@jadomi.fr>',
    to: 'karim_bahmed@yahoo.fr',
    subject: $(printf '%q' "$subject"),
    html: $(printf '%q' "$body")
  }).then(() => console.log('Email sent')).catch(e => console.log('Email error:', e.message));
  " 2>&1 | tee -a "$LOG"
}

get_product_count() {
  local site="$1"
  node -e "try{const d=require('/tmp/search-progress-${site}.json');const p=d.products||{};console.log(typeof p==='object'&&!Array.isArray(p)?Object.keys(p).length:0)}catch(e){console.log(0)}" 2>/dev/null
}

get_total() {
  node -e "
  const fs=require('fs');let t=0;
  const skip=['backup','dentalpromotion','dbidental'];
  fs.readdirSync('/tmp').filter(f=>f.startsWith('search-progress-')&&f.endsWith('.json')&&!skip.some(s=>f.includes(s))).forEach(f=>{
    try{const d=JSON.parse(fs.readFileSync('/tmp/'+f));const p=d.products||{};t+=typeof p==='object'&&!Array.isArray(p)?Object.keys(p).length:0}catch(e){}
  });console.log(t)" 2>/dev/null
}

build_report() {
  local total=$(get_total)
  local report="<h2>🦷 JADOMI Scraper - Rapport</h2><table border='1' style='border-collapse:collapse;padding:5px'>"
  report+="<tr><th>Site</th><th>Produits</th></tr>"

  for f in /tmp/search-progress-*.json; do
    name=$(basename "$f" .json | sed 's/search-progress-//')
    # Skip backups and dead sites
    echo "$name" | grep -qE "backup|dentalpromotion|dbidental" && continue
    count=$(get_product_count "$name")
    [ "$count" -gt 0 ] && report+="<tr><td>$name</td><td><b>$count</b></td></tr>"
  done

  report+="<tr style='background:#f0f0f0'><td><b>TOTAL</b></td><td><b>$total</b></td></tr>"
  report+="</table>"
  report+="<p>Heure: $(date '+%H:%M %d/%m/%Y')</p>"
  report+="<p>RAM: $(free -h | grep Mem | awk '{print $3"/"$2}')</p>"
  report+="<p>Scrapers actifs: $(pgrep -fc 'scrape' 2>/dev/null || echo 0)</p>"

  echo "$report"
}

# =============================================
# MAIN
# =============================================

log "========== DEMARRAGE SCRAPER AUTONOME =========="
log "Les rapports seront envoyés à karim_bahmed@yahoo.fr"

# Phase 1: Relancer Doctor-AI search (avec reset des queries crashées)
log "Phase 1: Doctor-AI search (fix crashes)"
node scripts/scrape-by-search.js --site doctorai 2>&1 | tee -a "$LOG" &
DOCTORAI_PID=$!
log "Doctor-AI lancé (PID: $DOCTORAI_PID)"

# Wait for Doctor-AI
wait $DOCTORAI_PID 2>/dev/null
log "Doctor-AI terminé"
killall -9 chrome 2>/dev/null
sleep 5

# Send progress report
send_report "JADOMI Scraper - Doctor-AI terminé" "$(build_report)"

# Phase 2: Doctor Strong
log "Phase 2: Doctor Strong search"
# Reset crashed queries
node -e "
const fs=require('fs');
try {
  const d=require('/tmp/search-progress-doctorstrong.json');
  const gq=new Set();
  for(const[k,p] of Object.entries(d.products)){if(p.searchQuery)gq.add(p.searchQuery)}
  fs.writeFileSync('/tmp/search-progress-doctorstrong.json',JSON.stringify({completedQueries:Array.from(gq),products:d.products},null,2));
  console.log('Reset OK: '+gq.size+' good queries');
} catch(e){console.log('No progress to reset')}
"
node scripts/scrape-by-search.js --site doctorstrong 2>&1 | tee -a "$LOG" &
DS_PID=$!
wait $DS_PID 2>/dev/null
log "Doctor Strong terminé"
killall -9 chrome 2>/dev/null
sleep 5

send_report "JADOMI Scraper - Doctor Strong terminé" "$(build_report)"

# Phase 3: B2B Dental
log "Phase 3: B2B Dental search"
node -e "
const fs=require('fs');
try {
  const d=require('/tmp/search-progress-b2b-dental.json');
  const gq=new Set();
  for(const[k,p] of Object.entries(d.products)){if(p.searchQuery)gq.add(p.searchQuery)}
  fs.writeFileSync('/tmp/search-progress-b2b-dental.json',JSON.stringify({completedQueries:Array.from(gq),products:d.products},null,2));
} catch(e){}
"
node scripts/scrape-by-search.js --site b2b-dental 2>&1 | tee -a "$LOG" &
B2B_PID=$!
wait $B2B_PID 2>/dev/null
log "B2B Dental terminé"
killall -9 chrome 2>/dev/null
sleep 5

send_report "JADOMI Scraper - B2B Dental terminé" "$(build_report)"

# Phase 4: Mega Dental
log "Phase 4: Mega Dental search"
node -e "
const fs=require('fs');
try {
  const d=require('/tmp/search-progress-megadental.json');
  const gq=new Set();
  for(const[k,p] of Object.entries(d.products)){if(p.searchQuery)gq.add(p.searchQuery)}
  fs.writeFileSync('/tmp/search-progress-megadental.json',JSON.stringify({completedQueries:Array.from(gq),products:d.products},null,2));
} catch(e){}
"
node scripts/scrape-by-search.js --site megadental 2>&1 | tee -a "$LOG" &
MEGA_PID=$!
wait $MEGA_PID 2>/dev/null
log "Mega Dental terminé"
killall -9 chrome 2>/dev/null
sleep 5

# Final report
log "========== TOUS LES SCRAPERS TERMINES =========="
TOTAL=$(get_total)
log "TOTAL FINAL: $TOTAL produits"

send_report "🦷 JADOMI Scraper TERMINE - $TOTAL produits au total" "$(build_report)<h3>✅ Tous les scrapers sont terminés!</h3><p>Le comparateur JADOMI dispose maintenant de <b>$TOTAL produits</b> dans sa base.</p>"

log "FIN DU SCRIPT AUTONOME"
