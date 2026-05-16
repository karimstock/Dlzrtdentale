#!/usr/bin/env node
// =============================================
// Test connexion Kling API — Auth JWT uniquement
// 0 unit consommée, 0 génération
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const axios = require('axios');

const KLING_BASE_URL = 'https://api.klingai.com/v1';
const accessKey = process.env.KLING_ACCESS_KEY;
const secretKey = process.env.KLING_SECRET_KEY;

console.log('=== Test Auth Kling API ===\n');

// 1. Vérifier que les clés sont présentes
if (!accessKey || !secretKey) {
  console.error('KLING_ACCESS_KEY:', accessKey ? 'présente' : 'MANQUANTE');
  console.error('KLING_SECRET_KEY:', secretKey ? 'présente' : 'MANQUANTE');
  process.exit(1);
}
console.log('KLING_ACCESS_KEY:', accessKey.slice(0, 8) + '...' + accessKey.slice(-4));
console.log('KLING_SECRET_KEY:', secretKey.slice(0, 4) + '***' + secretKey.slice(-4));

// 2. Générer le JWT
function generateJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: accessKey,
    exp: now + 1800,
    iat: now,
    nbf: now - 5
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const jwt = generateJWT();
console.log('\nJWT généré:', jwt.slice(0, 30) + '...' + jwt.slice(-10));
console.log('JWT longueur:', jwt.length, 'chars\n');

// 3. Test API — appel trivial (liste des tâches vidéo, page 1, limite 1)
// Cet endpoint retourne les tâches existantes, ne consomme rien
async function testAuth() {
  const endpoints = [
    { name: 'GET /videos/text2video (list tasks)', url: `${KLING_BASE_URL}/videos/text2video`, method: 'get' },
    { name: 'GET /images/generations (list tasks)', url: `${KLING_BASE_URL}/images/generations`, method: 'get' },
  ];

  for (const ep of endpoints) {
    console.log(`Test: ${ep.name}...`);
    try {
      const resp = await axios({
        method: ep.method,
        url: ep.url,
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
        params: { pageNum: 1, pageSize: 1 },
      });
      console.log(`  Status: ${resp.status}`);
      console.log(`  Code API: ${resp.data?.code}`);
      console.log(`  Message: ${resp.data?.message || 'OK'}`);
      console.log(`  Data: ${JSON.stringify(resp.data?.data)?.slice(0, 100) || 'null'}`);

      if (resp.status === 200 && (resp.data?.code === 0 || resp.data?.code === undefined)) {
        console.log('\n  AUTH VALIDE — Kling API accessible');
        return true;
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.log(`  Status: ${status || 'network error'}`);
      console.log(`  Erreur: ${JSON.stringify(data) || err.message}`);
      if (status === 401 || status === 403) {
        console.log('\n  AUTH REJETEE — JWT invalide ou clés incorrectes');
      }
    }
    console.log('');
  }
  return false;
}

testAuth().then(ok => {
  console.log('\n' + '='.repeat(40));
  if (ok) {
    console.log('RESULTAT: Auth valide, Kling API pret');
  } else {
    console.log('RESULTAT: Auth echouee, verifier les cles');
  }
  process.exit(ok ? 0 : 1);
});
