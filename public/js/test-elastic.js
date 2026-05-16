// TEST — Trouver les endpoints ElasticSuite et Magento disponibles
// Collez sur megadental.fr connecte

// 1. Config Magento dans la page
console.log('=== CONFIG MAGENTO ===');
var scripts = document.querySelectorAll('script[type="text/x-magento-init"]');
scripts.forEach(function(s, i) {
  var txt = s.textContent;
  if (txt.indexOf('suggest') > -1 || txt.indexOf('search') > -1 || txt.indexOf('elastic') > -1 || txt.indexOf('product') > -1) {
    console.log('Script ' + i + ':', txt.substring(0, 500));
  }
});

// 2. Tester product_list_limit
console.log('\n=== TEST PAGINATION ETENDUE ===');
fetch(location.origin + '/usage-unique.html?product_list_limit=all').then(function(r){return r.text()}).then(function(h){
  var d = new DOMParser().parseFromString(h, 'text/html');
  var count = d.querySelectorAll('form.product-item,.product-item').length;
  console.log('limit=all: ' + count + ' produits');
});
fetch(location.origin + '/usage-unique.html?product_list_limit=10000').then(function(r){return r.text()}).then(function(h){
  var d = new DOMParser().parseFromString(h, 'text/html');
  var count = d.querySelectorAll('form.product-item,.product-item').length;
  console.log('limit=10000: ' + count + ' produits');
});
fetch(location.origin + '/usage-unique.html?product_list_limit=96').then(function(r){return r.text()}).then(function(h){
  var d = new DOMParser().parseFromString(h, 'text/html');
  var count = d.querySelectorAll('form.product-item,.product-item').length;
  console.log('limit=96: ' + count + ' produits');
});

// 3. Tester les endpoints de recherche
console.log('\n=== TEST SEARCH ENDPOINTS ===');
fetch('/search/ajax/suggest/?q=gants&_=' + Date.now()).then(function(r){return r.json()}).then(function(d){
  console.log('suggest:', JSON.stringify(d).substring(0, 300));
});
fetch('/catalogsearch/result/?q=a&product_list_limit=96').then(function(r){return r.text()}).then(function(h){
  var d = new DOMParser().parseFromString(h, 'text/html');
  var count = d.querySelectorAll('form.product-item,.product-item').length;
  var pages = 1;
  d.querySelectorAll('.pages a').forEach(function(a){var m=a.textContent.match(/(\d+)/);if(m){var n=parseInt(m[1]);if(n>pages)pages=n;}});
  console.log('search "a" limit=96: ' + count + ' produits, ' + pages + ' pages (total ~' + (count*pages) + ')');
});

// 4. Trouver les URLs Alpine/ElasticSuite
console.log('\n=== ELASTICSUITE CONFIG ===');
var allScripts = document.querySelectorAll('script');
allScripts.forEach(function(s) {
  var src = s.getAttribute('src') || '';
  if (src.indexOf('ElasticSuite') > -1 || src.indexOf('elasticsuite') > -1 || src.indexOf('Smile') > -1) {
    console.log('ES Script: ' + src);
  }
});

// 5. Variables globales utiles
console.log('\n=== VARIABLES GLOBALES ===');
if (window.esConfig) console.log('esConfig:', JSON.stringify(window.esConfig).substring(0, 500));
if (window.searchConfig) console.log('searchConfig:', JSON.stringify(window.searchConfig).substring(0, 500));
if (window.catalogAddToCart) console.log('catalogAddToCart present');
var xData = document.querySelectorAll('[x-data]');
console.log('Alpine components: ' + xData.length);
