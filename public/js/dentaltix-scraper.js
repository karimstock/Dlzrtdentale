// JADOMI — Scraper Dentaltix (scrape page courante uniquement)
// Naviguez sur une catégorie dentaltix.com/fr/xxx puis collez ce script
// Il scrape la page visible, stocke en localStorage, et passe à la page suivante
(function(){
var KEY='jadomi_dentaltix';
var existing=JSON.parse(localStorage.getItem(KEY)||'{}');
var added=0;
document.querySelectorAll('.product-item').forEach(function(e){
  var txt=e.innerText||'';
  var lines=txt.split('\n').map(function(l){return l.trim()}).filter(function(l){return l.length>0});
  var nm='',brand='',pr=null,op=null;
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(line==='Voir options'||line.match(/^\(\d+\)$/))continue;
    if(line.indexOf('dans ')===0){brand=line.replace('dans ','');continue}
    var prices=line.match(/(\d+[.,]\d{2})\s*\u20ac/g);
    if(prices){
      if(prices.length>=2){op=parseFloat(prices[0].replace(',','.'));pr=parseFloat(prices[1].replace(',','.'))}
      else{pr=parseFloat(prices[0].replace(',','.'))}
      continue
    }
    if(!nm&&line.length>3&&!line.match(/^\d/)&&line!=='Voir options')nm=line
  }
  var link=e.querySelector('a');
  if(nm&&pr){
    var k=nm+'|'+brand;
    if(!existing[k]){existing[k]={name:nm,price:pr,ref:'',oldPrice:op,discount:op&&pr?Math.round((1-pr/op)*100):null,url:link?link.href:'',category:location.pathname,brand:brand};added++}
  }
});
localStorage.setItem(KEY,JSON.stringify(existing));
var total=Object.keys(existing).length;
document.title='JADOMI:'+total+' (+'+added+')';
console.log('[JADOMI] Page: '+location.pathname+' | +'+added+' nouveaux | Total: '+total+' produits');

// Trouver la page suivante
var nextLink=document.querySelector('.pager-next a, a.next, a[rel="next"]');
if(nextLink){
  console.log('[JADOMI] Page suivante: '+nextLink.href);
  setTimeout(function(){location.href=nextLink.href},1500);
}else{
  console.log('[JADOMI] Derniere page de cette categorie.');
  console.log('[JADOMI] Pour envoyer: ouvrez jadomi.fr/import-relay.html et collez le contenu de localStorage.jadomi_dentaltix');
  console.log('[JADOMI] Total accumule: '+total+' produits');
}
})();
