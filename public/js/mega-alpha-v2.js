// JADOMI — Scraper Mega Dental v2 — Anti-WAF + Resume
// Delais humains, retry backoff sur 403, sauvegarde localStorage, reprise
(function(){
var P={},T=Date.now(),queries=[],qi=0,totalPages=0,retries403=0,maxRetries=3;
var DELAY_QUERY_MIN=4000,DELAY_QUERY_MAX=8000;
var DELAY_PAGE_MIN=1500,DELAY_PAGE_MAX=3500;
var DELAY_403_BASE=30000; // 30s de pause apres un 403

// Restore from localStorage if resuming
var saved=localStorage.getItem('jadomi_mega_v2');
if(saved){try{var s=JSON.parse(saved);P=s.P||{};qi=s.qi||0;console.log('[JADOMI] REPRISE depuis query #'+qi+', '+Object.keys(P).length+' produits deja en memoire');}catch(e){}}

function l(m){document.title='JADOMI:'+Object.keys(P).length+' ['+Math.round((Date.now()-T)/1000)+'s]';console.log('[JADOMI '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function rnd(a,b){return a+Math.floor(Math.random()*(b-a));}
function save(){localStorage.setItem('jadomi_mega_v2',JSON.stringify({P:P,qi:qi}));}

function f(u,c){
  var x=new XMLHttpRequest();
  x.open('GET',u,true);
  x.setRequestHeader('Accept','text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  x.setRequestHeader('Accept-Language','fr-FR,fr;q=0.9,en;q=0.5');
  x.onload=function(){c(x.status,x.responseText);};
  x.onerror=function(){c(0,null);};
  x.send();
}

function parse(h){var d=new DOMParser().parseFromString(h,'text/html'),a=0;d.querySelectorAll('form.product-item,.product-item').forEach(function(e){var h3=e.querySelector('h3');var nm=h3?h3.textContent.trim():'';var pe=e.querySelector('[data-price-type="finalPrice"] .price,.special-price .price,.price');var pr=null;if(pe){pr=parseFloat(pe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));if(isNaN(pr))pr=null;}var oe=e.querySelector('[data-price-type="oldPrice"] .price,.old-price .price');var op=null;if(oe){op=parseFloat(oe.textContent.replace(/[^0-9.,]/g,'').replace(',','.'));if(isNaN(op))op=null;}var de=e.querySelector('.discount');var dc=null;if(de){var dm=de.textContent.match(/-?\d+/);if(dm)dc=Math.abs(parseInt(dm[0]));}var sk=e.getAttribute('data-sku')||'';var li=e.querySelector('a.product-item-link');var ur=li?li.href:'';if(nm&&nm.length>2&&pr!==null){var k=nm+'|'+sk;if(!P[k]){P[k]={name:nm,price:pr,ref:sk,oldPrice:op,discount:dc,url:ur};a++;}}});return a;}

function maxP(h){var d=new DOMParser().parseFromString(h,'text/html'),m=1;d.querySelectorAll('.pages a').forEach(function(a){var r=a.textContent.match(/(\d+)/);if(r){var n=parseInt(r[1]);if(n>m)m=n;}var hr=(a.getAttribute('href')||'').match(/p=(\d+)/);if(hr){var n=parseInt(hr[1]);if(n>m)m=n;}});return m;}

function searchQuery(q,cb){
  var url=location.origin+'/catalogsearch/result/?q='+encodeURIComponent(q);
  f(url,function(status,h){
    if(status===403){
      retries403++;
      if(retries403<=maxRetries){
        var wait=DELAY_403_BASE*retries403;
        l('⚠ 403 sur "'+q+'" — pause '+Math.round(wait/1000)+'s (tentative '+retries403+'/'+maxRetries+')');
        setTimeout(function(){searchQuery(q,cb);},wait);
      }else{
        l('✗ 403 persistant sur "'+q+" — skip ("+maxRetries+' tentatives)');
        retries403=0;cb();
      }
      return;
    }
    retries403=0;
    if(!h||status!==200){cb();return;}
    var a=parse(h);var mp=maxP(h);totalPages++;
    if(a>0)l('"'+q+'" p1/'+mp+' +'+a+' ='+Object.keys(P).length);
    if(mp<=1){cb();return;}
    var cp=2;
    function np(){
      if(cp>mp){cb();return;}
      setTimeout(function(){
        f(url+'&p='+cp,function(ps,ph){
          if(ps===200&&ph){var pa=parse(ph);totalPages++;if(pa>0)l('"'+q+'" p'+cp+'/'+mp+' +'+pa+' ='+Object.keys(P).length);}
          else if(ps===403){l('⚠ 403 page '+cp+' de "'+q+'" — skip page');}
          cp++;np();
        });
      },rnd(DELAY_PAGE_MIN,DELAY_PAGE_MAX));
    }
    np();
  });
}

function send(){var pr=Object.values(P);l('ENVOI via nouvelle fenetre...');var w=window.open('https://jadomi.fr/import-relay.html','jadomi_import');setTimeout(function(){w.postMessage({jadomi:true,payload:JSON.stringify({source:'megadental',products:pr.map(function(p){return{name:p.name,price:p.price,ref:p.ref||'',price_original:p.oldPrice||null,discount:p.discount||null};})})}, 'https://jadomi.fr');l('Donnees envoyees! localStorage nettoye.');localStorage.removeItem('jadomi_mega_v2');},4000);}

// Generer les requetes
var alpha='abcdefghijklmnopqrstuvwxyz';
for(var i=0;i<alpha.length;i++)queries.push(alpha[i]);
for(var i=0;i<alpha.length;i++)for(var j=0;j<alpha.length;j++)queries.push(alpha[i]+alpha[j]);
var dentaire=['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave','radiographie','blanchiment','prothese','empreinte','polissage','matrice','obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane','greffon','laser','scanner','ceramique','zircone','resine','amalgame','digue','lime','insert','scellement'];
dentaire.forEach(function(w){queries.push(w);});

l('=== JADOMI Scraper Mega Dental v2 (anti-WAF) ===');
l(queries.length+' requetes — reprise a #'+qi+' ('+Object.keys(P).length+' produits en cache)');
l('Delais: '+DELAY_QUERY_MIN/1000+'-'+DELAY_QUERY_MAX/1000+'s entre recherches, '+DELAY_PAGE_MIN/1000+'-'+DELAY_PAGE_MAX/1000+'s entre pages');
l('Estimation duree: ~60-90 min');

function go(){
  if(qi>=queries.length){
    l('========================================');
    l('TERMINE: '+Object.keys(P).length+' produits uniques');
    l(totalPages+' pages scrapees');
    l('========================================');
    save();send();return;
  }
  if(qi%26===0){
    save(); // sauvegarde tous les 26 queries
    l('--- '+qi+'/'+queries.length+' recherches, '+Object.keys(P).length+' produits [sauvegarde] ---');
  }
  searchQuery(queries[qi],function(){
    qi++;
    setTimeout(go,rnd(DELAY_QUERY_MIN,DELAY_QUERY_MAX));
  });
}
go();

// Commandes manuelles
window.jadomi_status=function(){l('Status: '+qi+'/'+queries.length+', '+Object.keys(P).length+' produits');};
window.jadomi_save=function(){save();l('Sauvegarde manuelle OK');};
window.jadomi_send=function(){send();};
window.jadomi_reset=function(){localStorage.removeItem('jadomi_mega_v2');l('Cache efface');};
window.jadomi_pause=function(){qi=queries.length;l('Pause — relancez le script pour reprendre');save();};
})();
