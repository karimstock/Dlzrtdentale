// =============================================
// JADOMI — Client OVH API partagé
// Singleton utilisé par tous les modules OVH
// =============================================
'use strict';

let _client = null;

function getOvhClient() {
  if (_client) return _client;

  const appKey = process.env.OVH_APP_KEY || process.env.OVH_APPLICATION_KEY;
  const appSecret = process.env.OVH_APP_SECRET || process.env.OVH_APPLICATION_SECRET;
  const consumerKey = process.env.OVH_CONSUMER_KEY;

  if (!appKey || !appSecret || !consumerKey) {
    console.warn('[OVH] Clés API manquantes — mode dégradé');
    return null;
  }

  try {
    const ovh = require('@ovhcloud/node-ovh');
    _client = ovh({
      endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
      appKey,
      appSecret,
      consumerKey
    });
    console.log('[JADOMI] Client OVH API initialisé');
    return _client;
  } catch (err) {
    console.error('[OVH] Init error:', err.message);
    return null;
  }
}

module.exports = { getOvhClient };
