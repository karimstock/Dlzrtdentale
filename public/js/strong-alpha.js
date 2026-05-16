// JADOMI — Scraper Doctor Strong par RECHERCHE ALPHABETIQUE
// Cherche "aa", "ab", "ac"... "zz" = 676 recherches
// Chaque recherche donne jusqu'a 160 produits differents
// Bypass total de la limite par categorie
(function(){
var P={},T=Date.now(),queries=[],qi=0,totalPages=0;
function l(m){document.title='JADOMI:'+Object.keys(P).length+' ['+Math.round((Date.now()-T)/1000)+'s]';console.log('[JADOMI '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function f(u,c){var x=new XMLHttpRequest();x.open('GET',u,true);x.onload=function(){c(x.status===200?x.responseText:null);};x.onerror=function(){c(null);};x.send();}
function parse(h){var d=new DOMParser().parseFromString(h,'text/html'),a=0;d.querySelectorAll('form.product-item,.product-item').forEach(function(e){var h3=e.querySelector('h3');var nm=h3?h3.textContent.trim():'';var pe=e.querySelector('[data-price-type="finalPrice"] .price,.special-price .price,.price');var pr=null;if(pe){pr=parseFloat(pe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));if(isNaN(pr))pr=null;}var oe=e.querySelector('[data-price-type="oldPrice"] .price,.old-price .price');var op=null;if(oe){op=parseFloat(oe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));if(isNaN(op))op=null;}var de=e.querySelector('.discount');var dc=null;if(de){var dm=de.textContent.match(/-?\d+/);if(dm)dc=Math.abs(parseInt(dm[0]));}var sk=e.getAttribute('data-sku')||'';var li=e.querySelector('a.product-item-link');var ur=li?li.href:'';if(nm&&nm.length>2&&pr!==null){var k=nm+'|'+sk;if(!P[k]){P[k]={name:nm,price:pr,ref:sk,oldPrice:op,discount:dc,url:ur};a++;}}});return a;}
function maxP(h){var d=new DOMParser().parseFromString(h,'text/html'),m=1;d.querySelectorAll('.pages a').forEach(function(a){var r=a.textContent.match(/(\d+)/);if(r){var n=parseInt(r[1]);if(n>m)m=n;}var hr=(a.getAttribute('href')||'').match(/p=(\d+)/);if(hr){var n=parseInt(hr[1]);if(n>m)m=n;}});return m;}
function searchQuery(q,cb){var url=location.origin+'/catalogsearch/result/?q='+encodeURIComponent(q);f(url,function(h){if(!h){cb();return;}var a=parse(h);var mp=maxP(h);totalPages++;if(a>0)l('"'+q+'" p1/'+mp+' +'+a+' ='+Object.keys(P).length);if(mp<=1){cb();return;}var cp=2;function np(){if(cp>mp){cb();return;}f(url+'&p='+cp,function(ph){if(ph){var pa=parse(ph);totalPages++;if(pa>0)l('"'+q+'" p'+cp+'/'+mp+' +'+pa+' ='+Object.keys(P).length);}cp++;setTimeout(np,250);});}np();});}
function send(){var pr=Object.values(P);l('ENVOI via nouvelle fenetre...');var w=window.open('https://jadomi.fr/import-relay.html','jadomi_import');setTimeout(function(){w.postMessage({jadomi:true,payload:JSON.stringify({source:'doctorstrong',products:pr.map(function(p){return{name:p.name,price:p.price,ref:p.ref||'',price_original:p.oldPrice||null,discount:p.discount||null};})})}, 'https://jadomi.fr');l('Donnees envoyees!');},4000);}

// Generer les requetes: d'abord lettres seules, puis 2 lettres, puis 3 si besoin
var alpha='abcdefghijklmnopqrstuvwxyz';
// Phase 1: lettres seules (26)
for(var i=0;i<alpha.length;i++)queries.push(alpha[i]);
// Phase 2: 2 lettres (676)
for(var i=0;i<alpha.length;i++)for(var j=0;j<alpha.length;j++)queries.push(alpha[i]+alpha[j]);
// Phase 3: chiffres + mots courants dentaires
var dentaire=['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave','radiographie','blanchiment','prothese','empreinte','polissage','matrice','obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane','greffon','laser','scanner','ceramique','zircone','resine','amalgame','digue','lime','insert','scellement'];
dentaire.forEach(function(w){queries.push(w);});

l('=== JADOMI Scraper Doctor Strong ALPHABETIQUE ===');
l(queries.length+' requetes de recherche a executer');
l('Estimation: ~20-40K produits uniques\n');

function go(){if(qi>=queries.length){l('========================================');l('TERMINE: '+Object.keys(P).length+' produits uniques');l(totalPages+' pages scrapees sur '+queries.length+' recherches');l('========================================');send();return;}if(qi%26===0&&qi>0)l('--- '+qi+'/'+queries.length+' recherches, '+Object.keys(P).length+' produits ---');searchQuery(queries[qi],function(){qi++;setTimeout(go,200);});}go();
})();
