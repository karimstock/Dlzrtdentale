require('dotenv').config();
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
  const lines = [];
  lines.push('=== RAPPORT JADOMI VPS — ' + new Date().toLocaleString('fr-FR', {timeZone:'Europe/Paris'}) + ' ===\n');

  // Scrapers actifs
  try {
    const ps = execSync('ps aux | grep -E "node.*scrape|node.*enrich|node.*cross|node.*match|crawlee" | grep -v grep | wc -l').toString().trim();
    lines.push('Processus actifs: ' + ps);
  } catch(e) { lines.push('Processus actifs: 0'); }

  // Gerho
  try {
    const log = fs.readFileSync('/tmp/gerho-crawlee.log','utf8');
    const matches = log.match(/total: (\d+)/g);
    const total = matches ? matches[matches.length-1].match(/\d+/)[0] : '?';
    lines.push('Gerho: ' + total + ' produits');
  } catch(e) { lines.push('Gerho: termine ou pas demarre'); }

  // Henry Schein
  try {
    const log = fs.readFileSync('/tmp/hs-enrich-v2.log','utf8');
    const last = log.split('\n').filter(l => l.includes('%')).pop();
    lines.push('Henry Schein: ' + (last || 'termine'));
  } catch(e) { lines.push('Henry Schein: termine'); }

  // Cross-search
  try {
    const log = fs.readFileSync('/tmp/cross-search.log','utf8');
    const lastLine = log.trim().split('\n').pop();
    lines.push('Cross-search: ' + lastLine);
  } catch(e) { lines.push('Cross-search: pas demarre'); }

  // Matching
  try {
    const log = fs.readFileSync('/tmp/matching-cross-supplier.log','utf8');
    const lastLine = log.trim().split('\n').pop();
    lines.push('Matching: ' + lastLine);
  } catch(e) {}

  // Base totale
  try {
    const {createClient} = require('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {count} = await db.from('scraped_prices').select('*',{count:'exact',head:true});
    lines.push('\nTotal scraped_prices: ' + (count||0).toLocaleString());
    const {count:patients} = await db.from('patients_jadomi').select('*',{count:'exact',head:true});
    lines.push('Total patients: ' + (patients||0).toLocaleString());
  } catch(e) {}

  // Flutter
  try {
    const screens = execSync('ls /home/ubuntu/jadomi-app/lib/screens/*.dart 2>/dev/null | wc -l').toString().trim();
    lines.push('Flutter screens: ' + screens);
  } catch(e) {}

  const report = lines.join('\n');
  console.log(report);

  // Email
  try {
    const {sendMail} = require('/home/ubuntu/jadomi/api/multiSocietes/mailer');
    await sendMail({
      to: 'karim_bahmed@yahoo.fr',
      subject: 'JADOMI VPS — ' + new Date().toLocaleTimeString('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit'}),
      html: '<pre style="font-family:monospace;font-size:13px;background:#0A0A0B;color:#2dd4bf;padding:20px;border-radius:8px;white-space:pre-wrap;">' + report + '</pre>'
    });
    console.log('Email envoye !');
  } catch(e) { console.error('Email erreur:', e.message); }
})();
