// =============================================
// JADOMI — PISTE OAuth2 Token Manager
// Gère l'authentification OAuth2 avec piste.gouv.fr
// Token auto-refresh, cache mémoire, retry
// =============================================

const OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';

let _cachedToken = null;
let _tokenExpiry = 0;

/**
 * Obtient un token OAuth2 PISTE (client_credentials).
 * Cache en mémoire, auto-refresh 60s avant expiration.
 */
async function getToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry > now + 60000) {
    return _cachedToken;
  }

  const clientId = process.env.PISTE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.PISTE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PISTE_OAUTH_CLIENT_ID ou PISTE_OAUTH_CLIENT_SECRET manquant dans .env');
  }

  const resp = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid'
    }).toString()
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[piste-auth] Erreur OAuth:', resp.status, errText);
    throw new Error('Erreur OAuth PISTE: ' + resp.status);
  }

  const data = await resp.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in || 3600) * 1000;

  return _cachedToken;
}

/**
 * Headers authentifiés pour appeler les APIs PISTE.
 */
async function getAuthHeaders() {
  const token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * Invalide le cache token (en cas d'erreur 401).
 */
function invalidateToken() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

module.exports = { getToken, getAuthHeaders, invalidateToken };
