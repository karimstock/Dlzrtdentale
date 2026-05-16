(function(){
var P={},T=Date.now(),done=false,totalSR=0,qi=0;
var queries=[];
var cats=['cabinet','laboratoire','equipement','orthodontie','restauration','endodontie','chirurgie','prophylaxie','prothese','implant','empreinte','blanchiment','radiographie','sterilisation','desinfection','anesthesie','instruments','fraises','ciments','composites','ceramique','silicone','alginate','gants','masques','aspiration','turbine','detartreur','polissage','matrice','membrane','laser','scanner','zircone','resine','adhesif','obturation'];
cats.forEach(function(c){queries.push(c);});
'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function(a){queries.push(a);});
'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function(a){'aeioulmrsctp'.split('').forEach(function(b){queries.push(a+b);});});
var saved=localStorage.getItem('jadomi_dc3');
if(saved){try{var s=JSON.parse(saved);P=s.P||{};qi=s.qi||0;totalSR=s.sr||0;console.log('[DC] REPRISE #'+qi+', '+Object.keys(P).length+' produits');}catch(e){}}
function l(m){document.title='DC:'+Object.keys(P).length+'/'+totalSR+'sr';console.log('[DC '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function save(){localStorage.setItem('jadomi_dc3',JSON.stringify({P:P,qi:qi,sr:totalSR}));}
function parseCards(h){
var d=new DOMParser().parseFromString(h,'text/html');
var cards=d.querySelectorAll('.product-card');
var added=0;
cards.forEach(function(c){
var ne=c.querySelector('.product-card__name');
var name=ne?(ne.textContent||'').trim():'';
if(!name||name.length<3)return;
var fp=c.querySelector('.product-card__final-price-with-save');
var rp=c.querySelector('.product-card__regular-price');
var price=null,oldPrice=null;
if(fp){var m=fp.textContent.match(/(\d[\d\s]*[.,]\d{2})/);if(m)price=parseFloat(m[1].replace(/\s/g,'').replace(',','.'));}
if(!price&&rp){var m2=rp.textContent.match(/(\d[\d\s]*[.,]\d{2})/);if(m2)price=parseFloat(m2[1].replace(/\s/g,'').replace(',','.'));}
if(rp){var m3=rp.textContent.match(/(\d[\d\s]*[.,]\d{2})/);if(m3){oldPrice=parseFloat(m3[1].replace(/\s/g,'').replace(',','.'));if(oldPrice===price)oldPrice=null;}}
var link=c.querySelector('a');var url=link?link.href:'';
var brand='';var bi=c.querySelector('.product-card__brand-image img');if(bi)brand=(bi.alt||'').trim();
var disc='';var dp=c.querySelector('.product-card__save-percent');if(dp)disc=(dp.textContent||'').trim();
var sousRefs=[];
c.querySelectorAll('.product-card__grouped-item').forEach(function(sr){
var txt=(sr.textContent||'').replace(/\s+/g,' ').trim();
var parts=txt.split(/\s{2,}|\n/);
var srName=parts[0]||'';
var ref='';var rm=txt.match(/\b(\d{4,6}[A-Z]?)\b/);if(rm)ref=rm[1];
var srPrice=null;var pm=txt.match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/);if(pm)srPrice=parseFloat(pm[1].replace(/\s/g,'').replace(',','.'));
if(srName.length>2){sousRefs.push({name:srName,ref:ref,price:srPrice});totalSR++;}
});
if(price){var k=name.substring(0,80)+'|'+brand;if(!P[k]){P[k]={name:name,price:price,ref:'',oldPrice:oldPrice,url:url,brand:brand,discount:disc,sous_refs:sousRefs};added++;}}
});
return{added:added,total:cards.length};
}
function searchPages(q,pg,cb){
fetch('/products/search?q='+encodeURIComponent(q)+'&p='+pg+'&limit=100&orderBy[_score]=desc')
.then(function(r){return r.text();})
.then(function(h){
var r=parseCards(h);
if(r.added>0)l('"'+q+'" p'+pg+' +'+r.added+' ='+Object.keys(P).length+' ('+totalSR+' sr)');
var d2=new DOMParser().parseFromString(h,'text/html');
var mp=pg;
d2.querySelectorAll('a[href*="p="]').forEach(function(a){var m=(a.getAttribute('href')||'').match(/p=(\d+)/);if(m){var n=parseInt(m[1]);if(n>mp)mp=n;}});
if(pg<mp&&pg<10){setTimeout(function(){searchPages(q,pg+1,cb);},800+Math.random()*600);}
else{cb();}
}).catch(function(e){l('Err "'+q+'": '+e);cb();});
}
function go(){
if(qi>=queries.length||done)return finish();
if(qi%20===0)save();
searchPages(queries[qi],1,function(){qi++;setTimeout(go,600+Math.random()*800);});
}
function finish(){
done=true;save();var pr=Object.values(P);
l('TERMINE: '+pr.length+' produits, '+totalSR+' sous-refs');
var flat=[];
pr.forEach(function(p){
flat.push({name:p.name,price:p.price,ref:p.ref,price_original:p.oldPrice,brand:p.brand,url:p.url});
if(p.sous_refs)p.sous_refs.forEach(function(sr){
flat.push({name:p.name+' - '+sr.name,price:sr.price||p.price,ref:sr.ref,price_original:p.oldPrice,brand:p.brand,url:p.url});
});
});
l('TOTAL ECLATE: '+flat.length+' lignes');
l('Telechargement du fichier JSON...');
var blob=new Blob([JSON.stringify(flat,null,2)],{type:'application/json'});
var a2=document.createElement('a');
a2.href=URL.createObjectURL(blob);
a2.download='dentalclick-v4-'+flat.length+'.json';
a2.click();
l('Fichier telecharge ! Va sur jadomi.fr/import-relay.html ou colle dans la console jadomi.fr:');
l('fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))');
}
l('=== DENTALCLICK v4 === '+queries.length+' requetes, reprise #'+qi+', '+Object.keys(P).length+' en cache');
go();
window.dc_status=function(){l(qi+'/'+queries.length+', '+Object.keys(P).length+' produits, '+totalSR+' sous-refs');};
window.dc_stop=function(){done=true;finish();};
window.dc_reset=function(){localStorage.removeItem('jadomi_dc3');l('Reset OK');};
})();
