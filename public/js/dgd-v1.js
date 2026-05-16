(function(){
var P={},T=Date.now(),done=false,qi=0,totalSR=0,totalProducts=0;
var productUrls=[];
var catUrls=[];

function l(m){document.title='DGD:'+Object.keys(P).length+'sr';console.log('[DGD '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function rnd(a,b){return a+Math.floor(Math.random()*(b-a));}

// PHASE 1 : Collecter toutes les categories + pagination
function collectCats(){
  l('PHASE 1: Collecte des categories...');
  var seen={};
  document.querySelectorAll('a').forEach(function(a){
    var h=a.href;
    if(h.indexOf('categorie_')>-1&&h.indexOf('.html')>-1&&!seen[h]){
      seen[h]=true;
      catUrls.push(h);
    }
  });
  l(catUrls.length+' categories trouvees');
}

// PHASE 2 : Visiter chaque categorie pour collecter les URLs produits
function collectProducts(cb){
  l('PHASE 2: Collecte des URLs produits dans '+catUrls.length+' categories...');
  var ci=0;
  var seenProd={};
  function nextCat(){
    if(ci>=catUrls.length){l('PHASE 2 TERMINEE: '+productUrls.length+' URLs produits');return cb();}
    if(ci%20===0)l('Cat '+ci+'/'+catUrls.length+', '+productUrls.length+' URLs produits');
    fetch(catUrls[ci]).then(function(r){return r.text();}).then(function(h){
      var d=new DOMParser().parseFromString(h,'text/html');
      d.querySelectorAll('a').forEach(function(a2){
        var href=a2.href;
        if(href.indexOf('FicheArticle')>-1&&href.indexOf('idGamme')>-1&&!seenProd[href]){
          seenProd[href]=true;
          productUrls.push(href);
        }
      });
      // Pagination
      d.querySelectorAll('a').forEach(function(a2){
        var href=a2.href;
        if(href.indexOf('categorie_')>-1&&href.indexOf('_page')>-1&&href.indexOf('.html')>-1&&!seenProd[href]){
          seenProd[href]=true;
          catUrls.push(href);
        }
      });
      ci++;
      setTimeout(nextCat,rnd(300,600));
    }).catch(function(){ci++;setTimeout(nextCat,rnd(400,800));});
  }
  nextCat();
}

// PHASE 3 : Visiter chaque fiche produit
function scrapeProducts(){
  l('PHASE 3: Scraping '+productUrls.length+' fiches produits (reprise #'+qi+')');
  function next(){
    if(qi>=productUrls.length||done)return finish();
    if(qi%50===0)l('--- '+qi+'/'+productUrls.length+', '+Object.keys(P).length+' sous-refs ---');
    fetch(productUrls[qi]).then(function(r){return r.text();}).then(function(h){
      parseFiche(h,productUrls[qi]);
      qi++;
      setTimeout(next,rnd(500,1000));
    }).catch(function(){qi++;setTimeout(next,rnd(600,1200));});
  }
  next();
}

function parseFiche(html,url){
  var d=new DOMParser().parseFromString(html,'text/html');

  // Nom du produit
  var mainName='';
  var h1=d.querySelector('h1');
  if(h1)mainName=h1.textContent.replace(/\s+/g,' ').trim();
  if(!mainName){
    var title=(d.querySelector('title')||{}).textContent||'';
    mainName=title.split('-')[0].split('|')[0].trim();
  }
  if(!mainName||mainName.length<3)return;

  // Marque
  var brand='';
  var brandMatch=html.match(/Marque[:\s]*<[^>]*>([^<]+)/i);
  if(brandMatch)brand=brandMatch[1].trim();
  if(!brand){
    var brandMatch2=html.match(/(Dentsply|VDW|Kerr|3M|GC|Ivoclar|VOCO|Hu-Friedy|Coltene|Septodont|Acteon|Bien Air|NSK|KaVo|Melag|Durr|W&H|Hager|Kuraray|Shofu|Kulzer|Pierre Fabre|DMG|Solventum|Leone|Scheu)/i);
    if(brandMatch2)brand=brandMatch2[1];
  }

  // Parser toutes les lignes du tableau de sous-refs
  // Format DGD: ref | longueur | type canal | couleur | numero | prix promo | prix catalogue | remise
  var rows=d.querySelectorAll('tr');
  var foundSubs=false;

  for(var ri=0;ri<rows.length;ri++){
    var cells=rows[ri].querySelectorAll('td');
    if(cells.length<2)continue;

    var rowText=rows[ri].textContent.replace(/\s+/g,' ').trim();

    // Chercher une reference (5-6 chiffres)
    var refMatch=rowText.match(/\b(\d{5,7})\b/);
    var ref=refMatch?refMatch[1]:'';
    if(!ref)continue;

    // Chercher les prix (XX,XX €)
    var allPrices=[];
    var priceMatches=rowText.match(/(\d+[.,]\d{2})\s*\u20ac/g);
    if(priceMatches){
      priceMatches.forEach(function(pm){
        var v=parseFloat(pm.replace(/[^0-9.,]/g,'').replace(',','.'));
        if(v>0)allPrices.push(v);
      });
    }
    if(allPrices.length===0)continue;

    allPrices.sort(function(a,b){return a-b;});
    var price=allPrices[0];
    var priceOrig=allPrices.length>1?allPrices[allPrices.length-1]:null;
    if(price===priceOrig)priceOrig=null;

    // Remise
    var discMatch=rowText.match(/\-(\d+)%/);
    var discount=discMatch?'-'+discMatch[1]+'%':'';

    // Longueur (21 mm, 25 mm, 31 mm, 19 mm)
    var lenMatch=rowText.match(/(\d+)\s*mm/i);
    var longueur=lenMatch?lenMatch[1]+' mm':'';

    // Numero/taille (R25, R40, R50, S1, S2, F1-F5, SX, etc.)
    var numMatch=rowText.match(/\b(R25|R40|R50|S1|S2|SX|F1|F2|F3|F4|F5|Assortiment[^,]*|Ass\.?[^,]*)\b/i);
    var numero=numMatch?numMatch[1]:'';

    // Couleur
    var coulMatch=rowText.match(/\b(Rouge|Noir|Jaune|Blanc|Bleu|Vert|Assorti)\b/i);
    var couleur=coulMatch?coulMatch[1]:'';

    // Type canal
    var canalMatch=rowText.match(/\b(Fins?|Moyens?|Larges?|Moyens et Larges)\b/i);
    var canal=canalMatch?canalMatch[1]:'';

    // Construire le nom complet de la sous-ref
    var subParts=[mainName];
    if(longueur)subParts.push(longueur);
    if(numero)subParts.push(numero);
    if(canal)subParts.push(canal);
    if(couleur)subParts.push(couleur);
    var fullName=subParts.join(' - ');

    var key=ref+'|'+price;
    if(!P[key]){
      P[key]={
        name:fullName,
        price:price,
        price_original:priceOrig,
        ref:ref,
        brand:brand,
        discount:discount,
        longueur:longueur,
        numero:numero,
        couleur:couleur,
        url:url
      };
      totalSR++;
      foundSubs=true;
    }
  }

  // Fallback : produit simple sans tableau
  if(!foundSubs){
    var allP=[];
    var pm2=html.match(/(\d+[.,]\d{2})\s*\u20ac/g);
    if(pm2)pm2.forEach(function(x){var v=parseFloat(x.replace(/[^0-9.,]/g,'').replace(',','.'));if(v>0)allP.push(v);});
    allP.sort(function(a,b){return a-b;});
    var fp=allP.length?allP[0]:null;
    var op=allP.length>1?allP[allP.length-1]:null;
    if(fp===op)op=null;
    var refF=url.match(/ref=(\d+)/);
    if(fp){
      var k2=mainName+'|'+fp;
      if(!P[k2]){
        P[k2]={name:mainName,price:fp,price_original:op,ref:refF?refF[1]:'',brand:brand,url:url};
        totalSR++;
      }
    }
  }

  totalProducts++;
}

function finish(){
  done=true;
  var pr=Object.values(P);
  l('=== TERMINE ===');
  l(totalProducts+' fiches visitees');
  l(pr.length+' sous-references extraites');

  console.log('Exemples:');
  for(var i=0;i<Math.min(10,pr.length);i++){
    var p=pr[i];
    console.log('  '+p.name.substring(0,70)+' | '+p.price+'E'+(p.price_original?' (barre:'+p.price_original+')':'')+' | ref:'+p.ref+' | '+p.brand);
  }

  var blob=new Blob([JSON.stringify(pr,null,2)],{type:'application/json'});
  var a2=document.createElement('a');
  a2.href=URL.createObjectURL(blob);
  a2.download='dentalgooddeal-'+pr.length+'.json';
  a2.click();
  l('Fichier telecharge ! Importer sur jadomi.fr:');
  l('fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))');
}

// LANCEMENT
l('=== DENTALGOODDEAL v1 ===');
collectCats();
collectProducts(function(){scrapeProducts();});

window.dgd_status=function(){l(qi+'/'+productUrls.length+' fiches, '+Object.keys(P).length+' sous-refs, '+totalProducts+' produits');};
window.dgd_stop=function(){done=true;finish();};
})();
