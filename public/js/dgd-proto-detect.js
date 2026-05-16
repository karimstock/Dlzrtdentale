// Detection DentalGoodDeal Prothesiste
var cats=[];
document.querySelectorAll('a').forEach(function(a){
  var h=a.href;
  if(h.indexOf('categorie_')>-1&&h.indexOf('.html')>-1) cats.push(h);
});
var u=[...new Set(cats)];
console.log(u.length+' categories prothesiste');

var oc=[];
document.querySelectorAll('[onclick]').forEach(function(e){
  var o=e.getAttribute('onclick');
  if(o.indexOf('article')>-1||o.indexOf('Fiche')>-1) oc.push(o.substring(0,150));
});
console.log(oc.length+' liens produits onclick');
console.log(oc.slice(0,5).join('\n'));

console.log('URL:', location.href);
console.log('Domain:', location.origin);
