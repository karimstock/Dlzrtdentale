#!/bin/bash
# =============================================
# JADOMI — Pipeline complet autonome
# 1. GACD deep (57K produits)
# 2. Cross-ref GACD → tous les sites concurrents
# 3. Rapport email à chaque étape
# =============================================

cd /home/ubuntu/jadomi
LOG="/tmp/jadomi-pipeline.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

send_email() {
  local subject="$1"
  local body="$2"
  node -e "
    const n=require('nodemailer');
    const t=n.createTransport({host:'pro2.mail.ovh.net',port:587,secure:false,auth:{user:'noreply@jadomi.fr',pass:'1987@Louiza'}});
    t.sendMail({from:'JADOMI Pipeline <noreply@jadomi.fr>',to:'karim_bahmed@yahoo.fr',subject:process.argv[1],html:process.argv[2]})
    .then(()=>console.log('Email OK')).catch(e=>console.log('Email err:',e.message));
  " "$subject" "$body" 2>&1 | tee -a "$LOG"
}

get_counts() {
  node -e "
    const fs=require('fs');const skip=['backup','dentalpromotion','dbidental'];
    const r=[];let t=0;
    fs.readdirSync('/tmp').filter(f=>f.startsWith('search-progress-')&&f.endsWith('.json')&&!skip.some(s=>f.includes(s))).forEach(f=>{
      try{const d=JSON.parse(fs.readFileSync('/tmp/'+f));const p=d.products||{};
      const c=typeof p==='object'&&!Array.isArray(p)?Object.keys(p).length:0;
      if(c>0){r.push(f.replace('search-progress-','').replace('.json','')+': '+c);t+=c}}catch(e){}
    });
    r.sort((a,b)=>parseInt(b.split(': ')[1])-parseInt(a.split(': ')[1]));
    r.forEach(l=>console.log(l));console.log('TOTAL: '+t);
  "
}

# =============================================
log "========== PIPELINE DÉMARRÉ =========="

# STEP 1: Wait for GACD deep to finish (already running)
log "Step 1: Attente fin GACD deep..."
while pgrep -f "scrape-gacd-algolia" > /dev/null 2>&1; do sleep 10; done
GACD_COUNT=$(node -e "try{const d=require('/tmp/search-progress-gacd.json');console.log(Object.keys(d.products).length)}catch(e){console.log(0)}")
log "GACD terminé: $GACD_COUNT produits"
send_email "JADOMI: GACD terminé — $GACD_COUNT produits" "<h2>GACD Deep Scrape terminé</h2><p><b>$GACD_COUNT produits</b> dans la base de référence.</p><p>Lancement du cross-ref sur tous les concurrents...</p>"

# STEP 2: Cross-ref GACD → chaque concurrent (UN PAR UN)
log "Step 2: Cross-ref GACD → tous les concurrents"

SITES="doctorai doctorstrong megadental b2b-dental dentalprive godentaire dentalachat topdentaire dental-france dentalevolution"

for site in $SITES; do
  log "Cross-ref: GACD → $site"

  # Kill old chrome
  killall -9 chrome 2>/dev/null
  sleep 3

  # Run crossref for this site
  timeout 3600 node scripts/scrape-crossref.js --site "$site" 2>&1 | tee -a "$LOG"

  # Kill chrome after
  killall -9 chrome 2>/dev/null
  sleep 5

  # Count matches
  MATCHES=$(node -e "try{const d=require('/tmp/jadomi-crossref/crossref-${site}.json');console.log(Object.keys(d.matches).length)}catch(e){console.log(0)}")
  TOTAL_SITE=$(node -e "try{const d=require('/tmp/search-progress-${site}.json');console.log(Object.keys(d.products).length)}catch(e){console.log(0)}")

  log "$site: $MATCHES matches cross-ref, $TOTAL_SITE produits total"

  send_email "JADOMI Cross-Ref: $site — $MATCHES correspondances" "<h2>Cross-Ref $site terminé</h2><p><b>$MATCHES correspondances</b> trouvées avec GACD</p><p>Total produits $site: <b>$TOTAL_SITE</b></p><pre>$(get_counts)</pre>"
done

# STEP 3: Rapport final
log "========== PIPELINE TERMINÉ =========="
FINAL_REPORT=$(get_counts)
log "$FINAL_REPORT"

send_email "JADOMI Pipeline TERMINÉ — Comparateur complet" "<h2>Pipeline Cross-Ref terminé</h2><p>Chaque produit GACD a été cherché sur tous les concurrents.</p><h3>Résultats:</h3><pre>$FINAL_REPORT</pre><p><i>Le comparateur JADOMI est maintenant opérationnel.</i></p>"

log "FIN"
