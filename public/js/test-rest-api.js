// TEST API REST MAGENTO — Tester differents endpoints pour acceder au catalogue complet
// Collez sur megadental.fr (connecte)
console.log('=== TEST API REST MAGENTO ===');

// Test 1: REST API V1 products (peut marcher si guest access est active)
fetch('/rest/V1/products?searchCriteria[pageSize]=5&searchCriteria[currentPage]=1&fields=items[sku,name,price]', {
  headers: { 'Accept': 'application/json' }
}).then(function(r) {
  console.log('REST V1 status:', r.status);
  return r.text();
}).then(function(t) {
  console.log('REST V1:', t.substring(0, 500));
}).catch(function(e) { console.log('REST V1 err:', e.message); });

// Test 2: REST API avec store code
fetch('/rest/default/V1/products?searchCriteria[pageSize]=5&searchCriteria[currentPage]=1&fields=items[sku,name,price]', {
  headers: { 'Accept': 'application/json' }
}).then(function(r) {
  console.log('REST default status:', r.status);
  return r.text();
}).then(function(t) {
  console.log('REST default:', t.substring(0, 500));
}).catch(function(e) { console.log('REST default err:', e.message); });

// Test 3: REST API categories (souvent moins protege)
fetch('/rest/V1/categories', {
  headers: { 'Accept': 'application/json' }
}).then(function(r) {
  console.log('Categories status:', r.status);
  return r.text();
}).then(function(t) {
  console.log('Categories:', t.substring(0, 500));
}).catch(function(e) { console.log('Categories err:', e.message); });

// Test 4: Store config (donne des infos sur le site)
fetch('/rest/V1/store/storeConfigs', {
  headers: { 'Accept': 'application/json' }
}).then(function(r) {
  console.log('StoreConfig status:', r.status);
  return r.text();
}).then(function(t) {
  console.log('StoreConfig:', t.substring(0, 500));
}).catch(function(e) { console.log('StoreConfig err:', e.message); });

// Test 5: Integration token via guest (souvent bloque mais on essaie)
fetch('/rest/V1/integration/customer/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'karim_bahmed@yahoo.fr', password: '1987@Amjad' })
}).then(function(r) {
  console.log('Token status:', r.status);
  return r.text();
}).then(function(t) {
  console.log('Token:', t.substring(0, 200));
  if (t.length > 5 && t[0] === '"') {
    // On a un token! Tester avec
    var token = JSON.parse(t);
    console.log('TOKEN OBTENU! Test avec auth...');
    fetch('/rest/V1/products?searchCriteria[pageSize]=5&fields=total_count,items[sku,name,price]', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
    }).then(function(r2) { return r2.text(); }).then(function(t2) {
      console.log('AVEC TOKEN:', t2.substring(0, 500));
    });
  }
}).catch(function(e) { console.log('Token err:', e.message); });

console.log('Requetes envoyees, attendez les reponses...');
