#!/usr/bin/env node
// =============================================
// JADOMI — Generateur Consumer Key OVH v3
// Droits COMPLETS : domaines, DNS, email, hosting, order
// Usage : node scripts/ovh-get-consumer-key.js
// =============================================

const ovh = require('@ovhcloud/node-ovh');

const client = ovh({
  endpoint: 'ovh-eu',
  appKey: '56157972695d0137',
  appSecret: '086003307b218ac971c1eec81ab75eb1'
});

// TOUS les droits necessaires — wildcard large
const accessRules = [
  // Compte
  { method: 'GET', path: '/*' },
  { method: 'POST', path: '/*' },
  { method: 'PUT', path: '/*' },
  { method: 'DELETE', path: '/*' }
];

client.requestPromised('POST', '/auth/credential', {
  accessRules: accessRules,
  redirection: 'https://jadomi.fr'
})
.then(result => {
  console.log('\n========================================');
  console.log('  JADOMI — Consumer Key OVH v3 (FULL)');
  console.log('========================================\n');
  console.log('Consumer Key :', result.consumerKey);
  console.log('\nVALIDE CE LIEN dans ton navigateur :');
  console.log(result.validationUrl);
  console.log('\n>>> Choisis DUREE ILLIMITEE puis valide <<<');
  console.log('========================================\n');
})
.catch(err => {
  console.error('Erreur :', err.message || err);
});
