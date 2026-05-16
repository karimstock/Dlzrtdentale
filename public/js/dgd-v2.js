(function(){
var P={},T=Date.now(),done=false,qi=0,totalSR=0,totalProducts=0;
var productUrls=[];
var catUrls=[];

function l(m){document.title='DGD:'+Object.keys(P).length+'sr';console.log('[DGD '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function rnd(a,b){return a+Math.floor(Math.random()*(b-a));}

// PHASE 1 : Collecter categories depuis la page actuelle
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

// PHASE 2 : Visiter chaque categorie, extraire les URLs produits depuis onclick
function collectProducts(cb){
  l('PHASE 2: Collecte URLs produits (onclick)...');
  var ci=0;
  var seenProd={};
  function nextCat(){
    if(ci>=catUrls.length){
      l('PHASE 2 TERMINEE: '+productUrls.length+' URLs produits uniques');
      return cb();
    }
    if(ci%20===0)l('Cat '+ci+'/'+catUrls.length+', '+productUrls.length+' URLs produits');
    fetch(catUrls[ci]).then(function(r){return r.text();}).then(function(h){
      var d=new DOMParser().parseFromString(h,'text/html');
      // Extraire URLs depuis onclick="location.href='...article_XXX.html'"
      d.querySelectorAll('[onclick]').forEach(function(el){
        var oc=el.getAttribute('onclick')||'';
        var m=oc.match(/location\.href='([^']*article_[^']+\.html)'/);
        if(m&&!seenProd[m[1]]){
          seenProd[m[1]]=true;
          var url=m[1];
          if(url.indexOf('http')!==0)url='https://www.dentalgooddeal.com/'+url.replace(/^\//,'');
          productUrls.push(url);
        }
      });
      // Aussi chercher les liens <a href="...article_...">
      d.querySelectorAll('a').forEach(function(a2){
        var href=a2.href||'';
        if(href.indexOf('article_')>-1&&href.indexOf('.html')>-1&&!seenProd[href]){
          seenProd[href]=true;
          productUrls.push(href);
        }
      });
      // Pagination
      d.querySelectorAll('a').forEach(function(a2){
        var href=a2.href||'';
        if(href.indexOf('categorie_')>-1&&href.indexOf('_page')>-1&&href.indexOf('.html')>-1&&catUrls.indexOf(href)===-1){
          catUrls.push(href);
        }
      });
      ci++;
      setTimeout(nextCat,rnd(300,600));
    }).catch(function(){ci++;setTimeout(nextCat,500);});
  }
  nextCat();
}

// PHASE 3 : Visiter chaque fiche produit et parser les sous-refs
function scrapeProducts(){
  l('PHASE 3: Scraping '+productUrls.length+' fiches...');
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

  // Nom produit : chercher dans le HTML le titre principal
  var mainName='';
  // Methode 1: h1 ou h2 court
  var headings=d.querySelectorAll('h1,h2');
  for(var hi=0;hi<headings.length;hi++){
    var ht=headings[hi].textContent.replace(/\s+/g,' ').trim();
    if(ht.length>5&&ht.length<200&&!/dentalgooddeal|panier|compte|contact/i.test(ht)){
      mainName=ht;break;
    }
  }
  // Methode 2: title
  if(!mainName){
    var title=(d.querySelector('title')||{}).textContent||'';
    mainName=title.split('-')[0].split('|')[0].replace(/dentalgooddeal/gi,'').trim();
  }
  if(!mainName||mainName.length<3)return;

  // Marque : chercher dans le texte
  var brand='';
  var brandPatterns=[
    /(?:Marque|Fabricant)\s*[:=]\s*([A-Za-z][A-Za-z0-9\s&\-\.]+?)(?:<|,|\n|$)/i,
    /\b(Dentsply Sirona|Dentsply|VDW|Kerr|3M|GC|Ivoclar|VOCO|Hu-Friedy|Coltene|Septodont|Acteon|Bien Air|NSK|KaVo|Melag|Durr|W&H|Hager|Kuraray|Shofu|Kulzer|Pierre Fabre|DMG|Solventum|Leone|Scheu|Anios|Medibase|Cattani|Euronda|Woson|Schulke|Proclinic|Zhermack|Tokuyama|Ultradent|Sdi|Komet|Mectron|EMS|Planmeca|Carestream)\b/i
  ];
  for(var bi=0;bi<brandPatterns.length&&!brand;bi++){
    var bm=html.match(brandPatterns[bi]);
    if(bm)brand=bm[1].trim();
  }

  // Parser les sous-refs : chercher tous les blocs avec une ref 5-6 chiffres + prix
  var foundSubs=false;

  // Methode 1: lignes de tableau <tr>
  var rows=d.querySelectorAll('tr');
  for(var ri=0;ri<rows.length;ri++){
    var result=parseRow(rows[ri].textContent,mainName,brand,url);
    if(result)foundSubs=true;
  }

  // Methode 2: divs/spans avec refs (si pas de tableau)
  if(!foundSubs){
    var allText=d.body?d.body.textContent:'';
    // Chercher pattern: ref(5-6 chiffres) ... prix(XX,XX €)
    var refPricePattern=/\b(\d{5,7})\b[^€]{0,200}?(\d+[.,]\d{2})\s*\u20ac/g;
    var rpm;
    while((rpm=refPricePattern.exec(allText))!==null){
      var ref3=rpm[1];
      var price3=parseFloat(rpm[2].replace(',','.'));
      if(price3>0&&!P[ref3+'|'+price3]){
        // Chercher un deuxieme prix (barre) proche
        var context=allText.substring(Math.max(0,rpm.index-50),rpm.index+rpm[0].length+100);
        var allP3=[];
        var pm3=context.match(/(\d+[.,]\d{2})\s*\u20ac/g);
        if(pm3)pm3.forEach(function(x){var v=parseFloat(x.replace(/[^0-9.,]/g,'').replace(',','.'));if(v>0)allP3.push(v);});
        allP3.sort(function(a,b){return a-b;});
        var fp3=allP3[0];
        var op3=allP3.length>1?allP3[allP3.length-1]:null;
        if(fp3===op3)op3=null;

        // Chercher longueur et numero pres de la ref
        var ctx2=allText.substring(Math.max(0,rpm.index-150),rpm.index+200);
        var lenM=ctx2.match(/(\d+)\s*mm/i);
        var numM=ctx2.match(/\b(R25|R40|R50|S1|S2|SX|F1|F2|F3|F4|F5|Assortiment[^,]{0,30})\b/i);
        var subParts=[mainName];
        if(lenM)subParts.push(lenM[1]+' mm');
        if(numM)subParts.push(numM[1]);

        P[ref3+'|'+fp3]={
          name:subParts.join(' - '),
          price:fp3,
          price_original:op3,
          ref:ref3,
          brand:brand,
          url:url
        };
        totalSR++;
        foundSubs=true;
      }
    }
  }

  // Fallback : produit simple
  if(!foundSubs){
    var allPF=[];
    var pmF=html.match(/(\d+[.,]\d{2})\s*\u20ac/g);
    if(pmF)pmF.forEach(function(x){var v=parseFloat(x.replace(/[^0-9.,]/g,'').replace(',','.'));if(v>0)allPF.push(v);});
    allPF.sort(function(a,b){return a-b;});
    if(allPF.length>0){
      var refUrl=url.match(/_(\d{5,7})(?:_|\.)/)
      var k4=mainName+'|'+allPF[0];
      if(!P[k4]){
        P[k4]={name:mainName,price:allPF[0],price_original:allPF.length>1&&allPF[allPF.length-1]!==allPF[0]?allPF[allPF.length-1]:null,ref:refUrl?refUrl[1]:'',brand:brand,url:url};
        totalSR++;
      }
    }
  }

  totalProducts++;
}

function parseRow(rowText,mainName,brand,url){
  var text=rowText.replace(/\s+/g,' ').trim();
  // Chercher ref (5-7 chiffres)
  var refMatch=text.match(/\b(\d{5,7})\b/);
  if(!refMatch)return false;
  var ref=refMatch[1];

  // Prix
  var allPrices=[];
  var priceMatches=text.match(/(\d+[.,]\d{2})\s*\u20ac/g);
  if(priceMatches){
    priceMatches.forEach(function(pm){
      var v=parseFloat(pm.replace(/[^0-9.,]/g,'').replace(',','.'));
      if(v>0)allPrices.push(v);
    });
  }
  if(allPrices.length===0)return false;

  allPrices.sort(function(a,b){return a-b;});
  var price=allPrices[0];
  var priceOrig=allPrices.length>1?allPrices[allPrices.length-1]:null;
  if(price===priceOrig)priceOrig=null;

  var discMatch=text.match(/\-(\d+)%/);
  var discount=discMatch?'-'+discMatch[1]+'%':'';
  var lenMatch=text.match(/(\d+)\s*mm/i);
  var longueur=lenMatch?lenMatch[1]+' mm':'';
  var numMatch=text.match(/\b(R25|R40|R50|S1|S2|SX|F1|F2|F3|F4|F5|Assortiment[^,]{0,30}|Ass\.[^,]{0,20}|3\s*x\s*R\d+[^,]{0,20})\b/i);
  var numero=numMatch?numMatch[1].trim():'';
  var coulMatch=text.match(/\b(Rouge|Noir|Jaune|Blanc|Bleu|Vert|Assorti)\b/i);
  var couleur=coulMatch?coulMatch[1]:'';
  var canalMatch=text.match(/\b(Fins?|Moyens?|Larges?|Moyens et Larges)\b/i);
  var canal=canalMatch?canalMatch[1]:'';

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
      url:url
    };
    totalSR++;
    return true;
  }
  return false;
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
  a2.download='dentalgooddeal-v2-'+pr.length+'.json';
  a2.click();
  l('Fichier telecharge ! Importer sur jadomi.fr:');
  l('fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))');
}

// LANCEMENT
l('=== DENTALGOODDEAL v2 (onclick) ===');
collectCats();
collectProducts(function(){scrapeProducts();});

window.dgd_status=function(){l(qi+'/'+productUrls.length+' fiches, '+Object.keys(P).length+' sous-refs, '+totalProducts+' produits');};
window.dgd_stop=function(){done=true;finish();};
})();
