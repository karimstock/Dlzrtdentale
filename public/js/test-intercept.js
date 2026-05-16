// INTERCEPTEUR — Capture toutes les requetes AJAX pour trouver l'API produits
// Collez sur megadental.fr puis tapez quelque chose dans la barre de recherche
var origOpen = XMLHttpRequest.prototype.open;
var origFetch = window.fetch;
var captured = [];

XMLHttpRequest.prototype.open = function(method, url) {
  if (url && (url.indexOf('search') > -1 || url.indexOf('product') > -1 || url.indexOf('suggest') > -1 || url.indexOf('elastic') > -1 || url.indexOf('ajax') > -1 || url.indexOf('graphql') > -1 || url.indexOf('api') > -1 || url.indexOf('catalog') > -1)) {
    console.log('[INTERCEPT XHR] ' + method + ' ' + url);
    captured.push({type: 'xhr', method: method, url: url});
  }
  return origOpen.apply(this, arguments);
};

window.fetch = function(url, opts) {
  var u = typeof url === 'string' ? url : (url.url || '');
  if (u && (u.indexOf('search') > -1 || u.indexOf('product') > -1 || u.indexOf('suggest') > -1 || u.indexOf('elastic') > -1 || u.indexOf('ajax') > -1 || u.indexOf('graphql') > -1 || u.indexOf('api') > -1 || u.indexOf('catalog') > -1)) {
    console.log('[INTERCEPT FETCH] ' + u);
    captured.push({type: 'fetch', url: u, opts: opts});
  }
  return origFetch.apply(this, arguments);
};

console.log('=== INTERCEPTEUR ACTIVE ===');
console.log('Maintenant tapez "gants" dans la barre de recherche du site');
console.log('Les requetes capturees apparaitront ici');
console.log('Apres avoir tape, executez: console.log(JSON.stringify(captured))');
