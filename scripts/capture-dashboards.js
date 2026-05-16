#!/usr/bin/env node
// =============================================
// Capture screenshots des dashboards JADOMI
// Pour intégration dans la vidéo pub
// =============================================
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://jadomi.fr';
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/videos/home/captures');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PAGES = [
  { id: 'organisation', url: '/organisation.html', name: 'Hub Multi-Sociétés' },
  { id: 'stock', url: '/index.html', name: 'Stock Intelligent' },
  { id: 'labo-dashboard', url: '/labo/dashboard.html', name: 'Dashboard Prothésiste' },
  { id: 'labo-production', url: '/labo/production.html', name: 'Suivi Production' },
  { id: 'labo-chat', url: '/labo/chat.html', name: 'Chat Dentiste-Prothésiste' },
  { id: 'labo-expeditions', url: '/labo/expeditions.html', name: 'Expéditions' },
  { id: 'ide-dashboard', url: '/ide/dashboard.html', name: 'Tournée Infirmière' },
  { id: 'livreur-app', url: '/labo/livreur-app.html', name: 'App Livreur GPS' },
  { id: 'suivi-livreurs', url: '/labo/suivi-livreurs.html', name: 'Suivi Livreurs Carte' },
  { id: 'studio', url: '/jadomi-studio.html', name: 'JADOMI Studio IA' },
  { id: 'admin-equipe', url: '/admin/dentiste-pro.html', name: 'Gestion Équipe' },
  { id: 'landing', url: '/', name: 'Landing Page' },
];

async function main() {
  console.log('=== Capture Dashboards JADOMI ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  for (const p of PAGES) {
    const outPath = path.join(OUTPUT_DIR, `${p.id}.png`);
    console.log(`[${p.id}] ${p.name}...`);

    try {
      await page.goto(`${BASE_URL}${p.url}`, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      // Attendre un peu pour les animations
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: outPath, fullPage: false });
      const size = fs.statSync(outPath).size;
      console.log(`  OK — ${(size/1024).toFixed(0)} KB`);
    } catch (err) {
      console.log(`  ERREUR: ${err.message.slice(0, 100)}`);
    }
  }

  await browser.close();
  console.log(`\nCaptures dans : ${OUTPUT_DIR}/`);
  console.log('Visualisez : https://jadomi.fr/assets/videos/home/captures/');
}

main().catch(err => {
  console.error('ERREUR:', err.message);
  process.exit(1);
});
