(function(){
var P={},T=Date.now(),done=false,qi=0,totalSR=0,totalProducts=0;
var productUrls=[];

// PAS de localStorage pour les URLs (trop lourd, cause QuotaExceeded)
// On sauvegarde uniquement les produits scrapes et l'index de reprise
var saved=localStorage.getItem('jadomi_dc5b');
if(saved){try{var s=JSON.parse(saved);P=s.P||{};qi=s.qi||0;totalSR=s.sr||0;totalProducts=s.tp||0;console.log('[DC5] REPRISE phase2 #'+qi+', '+Object.keys(P).length+' sous-refs');}catch(e){}}

function l(m){document.title='DC5:'+Object.keys(P).length+'sr';console.log('[DC5 '+Math.round((Date.now()-T)/1000)+'s] '+m);}
function save(){
  // Ne sauvegarder que les produits (pas les URLs)
  try{
    var toSave=JSON.stringify({P:P,qi:qi,sr:totalSR,tp:totalProducts});
    if(toSave.length<4500000){localStorage.setItem('jadomi_dc5b',toSave);}
    else{l('Save skip (trop lourd: '+Math.round(toSave.length/1024)+'KB)');}
  }catch(e){/* quota */}
}
function rnd(a,b){return a+Math.floor(Math.random()*(b-a));}

// PHASE 1 : Collecter URLs (rapide, en memoire seulement)
function collectUrls(cb){
  if(productUrls.length>0){l('URLs deja collectees: '+productUrls.length);return cb();}
  l('PHASE 1: Collecte des URLs produits...');
  var seen={};
  var cats=['cabinet','laboratoire','equipement','orthodontie','restauration','endodontie',
    'chirurgie','prophylaxie','prothese','implant','empreinte','blanchiment','radiographie',
    'sterilisation','desinfection','anesthesie','instruments','fraises','ciments','composites',
    'ceramique','silicone','alginate','gants','masques','aspiration','turbine','detartreur',
    'polissage','matrice','membrane','laser','scanner','zircone','resine','adhesif','obturation',
    'lime','endo','couronne','bridge','scellement','extraction','seringue','aiguille','suture'];
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function(a){cats.push(a);});
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function(a){'aeioulmrsctp'.split('').forEach(function(b){cats.push(a+b);});});
  var ci=0;
  function nextCat(){
    if(ci>=cats.length){l('PHASE 1 TERMINEE: '+productUrls.length+' URLs');return cb();}
    fetchCat(cats[ci],function(){ci++;setTimeout(nextCat,rnd(300,600));});
  }
  function fetchCat(q,done2){
    fetch('/products/search?q='+encodeURIComponent(q)+'&p=1&limit=100&orderBy[_score]=desc')
    .then(function(r){return r.text();})
    .then(function(h){
      var d=new DOMParser().parseFromString(h,'text/html');
      d.querySelectorAll('a[href]').forEach(function(a){
        var href=a.getAttribute('href')||'';
        if(href.startsWith('/'))href=location.origin+href;
        if(!href.includes('dentalclick.fr/')||href.includes('/login')||href.includes('/cart')||href.includes('/search')||href.includes('/products/search'))return;
        var parts=href.replace(/https?:\/\/[^/]+/,'').split('/').filter(Boolean);
        if(parts.length===1&&!seen[href]&&parts[0].length>3&&parts[0]!=='cabinet.html'&&parts[0]!=='laboratoire.html'&&parts[0]!=='equipement.html'){
          seen[href]=true;
          productUrls.push(href);
        }
      });
      if(ci%30===0)l('Phase1: '+ci+'/'+cats.length+' requetes, '+productUrls.length+' URLs');
      done2();
    }).catch(function(){done2();});
  }
  nextCat();
}

// PHASE 2 : Visiter chaque fiche et parser le tableau sous-refs
function scrapeProducts(){
  l('PHASE 2: '+productUrls.length+' fiches a visiter (reprise #'+qi+')');
  function next(){
    if(qi>=productUrls.length||done)return finish();
    if(qi%25===0&&qi>0)save();
    if(qi%50===0)l('--- '+qi+'/'+productUrls.length+', '+Object.keys(P).length+' sous-refs, '+totalProducts+' produits ---');
    fetch(productUrls[qi]).then(function(r){return r.text();}).then(function(h){
      parseFiche(h,productUrls[qi]);
      qi++;
      setTimeout(next,rnd(500,1000));
    }).catch(function(e){
      if(String(e).indexOf('429')!==-1){l('Rate limit, pause 30s');setTimeout(function(){next();},30000);}
      else{qi++;setTimeout(next,rnd(600,1200));}
    });
  }
  next();
}

function parseFiche(html,url){
  var d=new DOMParser().parseFromString(html,'text/html');

  // ── NOM PRODUIT ──
  // Le title de la page contient le nom : "Dentalclick ... NOM_PRODUIT | Dentalclick.fr"
  var pageTitle=(d.querySelector('title')||{}).textContent||'';
  var mainName='';
  // Extraire entre les separateurs
  var titleParts=pageTitle.split('|');
  if(titleParts.length>=2){
    // Le nom est dans la premiere partie, apres "Distributeur de produits dentaires"
    var raw=titleParts[0].trim();
    raw=raw.replace(/Dentalclick\s*(France)?\s*\|?\s*/gi,'').replace(/Distributeur de produits dentaires\s*/gi,'').trim();
    if(raw.length>3)mainName=raw;
  }
  // Fallback: chercher un h1 qui ne contient pas trop de texte
  if(!mainName){
    var h1s=d.querySelectorAll('h1');
    for(var hi=0;hi<h1s.length;hi++){
      var h1t=h1s[hi].textContent.trim();
      if(h1t.length>3&&h1t.length<200&&!/Dentalclick|distributeur/i.test(h1t)){mainName=h1t;break;}
    }
  }
  if(!mainName||mainName.length<3)return;
  // Nettoyer les retours a la ligne
  mainName=mainName.replace(/[\n\r\t]+/g,' ').replace(/\s+/g,' ').trim();

  // ── MARQUE ──
  var brand='';
  // Chercher "Marque: XXX" dans le texte
  var marqueMatch=html.match(/Marque[:\s]+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:<|,|\n)/);
  if(marqueMatch)brand=marqueMatch[1].trim();
  // Fallback: image alt
  if(!brand){
    var brandImg=d.querySelector('img[alt*="Brand"],img[class*="brand"]');
    if(brandImg)brand=(brandImg.alt||'').replace(/^Brand\s+/i,'').trim();
  }

  // ── CATEGORIE ──
  var category='',subCategory='';
  var breadcrumbs=d.querySelectorAll('a[href*=".html"]');
  var bcTexts=[];
  breadcrumbs.forEach(function(a){
    var t=a.textContent.trim();
    var h=a.getAttribute('href')||'';
    if(t.length>2&&t.length<50&&/\.(html)$/.test(h)&&!/login|cart|search/.test(h)){
      bcTexts.push(t);
    }
  });
  if(bcTexts.length>=2){category=bcTexts[0];subCategory=bcTexts[1];}
  else if(bcTexts.length===1){category=bcTexts[0];}

  // ── TABLEAU SOUS-REFERENCES ──
  // Le tableau a des lignes avec: Description, Ref, Ref Fabricant, Remise, Prix barre, Prix final
  var rows=d.querySelectorAll('tr');
  var foundSubs=false;

  for(var ri=0;ri<rows.length;ri++){
    var cells=rows[ri].querySelectorAll('td');
    if(cells.length<3)continue;

    // Lire le texte de chaque cellule
    var cellTexts=[];
    for(var ci2=0;ci2<cells.length;ci2++){
      cellTexts.push(cells[ci2].textContent.replace(/[\n\r\t]+/g,' ').replace(/\s+/g,' ').trim());
    }

    // Identifier les colonnes par leur contenu
    var subName='',ref='',refFab='',price=null,priceOrig=null,discount='';

    for(var ci3=0;ci3<cellTexts.length;ci3++){
      var ct=cellTexts[ci3];
      if(!ct)continue;

      // Ref interne (4-6 chiffres purs)
      if(!ref&&/^\d{4,6}$/.test(ct)){ref=ct;continue;}

      // Ref fabricant (commence par lettre, alphanum 5+)
      if(!refFab&&/^[A-Z][A-Z0-9\-\.]{4,}$/i.test(ct)&&ct!==ref){refFab=ct;continue;}

      // Remise (-XX%)
      if(!discount&&/^\-\d+%$/.test(ct)){discount=ct;continue;}

      // Prix (XX,XX ou XX.XX avec euro)
      var pm=ct.match(/(\d[\d\s]*[.,]\d{2})/);
      if(pm){
        var pv=parseFloat(pm[1].replace(/\s/g,'').replace(',','.'));
        if(pv>0){
          if(!priceOrig){priceOrig=pv;}
          else if(!price){price=pv;}
          else if(pv<price){priceOrig=price;price=pv;}
          continue;
        }
      }

      // Le reste = nom de la sous-ref (le plus long texte non-numerique)
      if(ct.length>5&&ct.length<200&&!/^\d+[.,]?\d*\s*(\u20ac|€)?$/.test(ct)&&!subName){
        subName=ct;
      }
    }

    // Si on a 2 prix, le plus petit = final, le plus grand = barre
    if(priceOrig&&price&&priceOrig<price){var tmp=price;price=priceOrig;priceOrig=tmp;}
    // Si on a qu'un prix
    if(priceOrig&&!price){price=priceOrig;priceOrig=null;}
    if(price===priceOrig)priceOrig=null;

    // Sauvegarder si on a au moins un prix et un nom ou ref
    if(price&&(subName||ref)){
      var fullName=subName||mainName;
      // Si le subName ne contient pas deja le nom principal, le prefixer
      if(subName&&mainName&&subName.toLowerCase().indexOf(mainName.toLowerCase().substring(0,15))===-1){
        fullName=mainName+' - '+subName;
      }
      var key=fullName+'|'+ref+'|'+price;
      if(!P[key]){
        P[key]={
          name:fullName,
          price:price,
          price_original:priceOrig,
          ref:ref,
          ref_fabricant:refFab,
          brand:brand,
          category:category,
          sub_category:subCategory,
          discount:discount,
          url:url
        };
        totalSR++;
        foundSubs=true;
      }
    }
  }

  // ── FALLBACK : produit simple sans tableau ──
  if(!foundSubs){
    // Chercher les prix dans la page
    var allPriceEls=d.querySelectorAll('[class*="price"]');
    var prices=[];
    allPriceEls.forEach(function(el){
      var t=el.textContent;
      var m=t.match(/(\d[\d\s]*[.,]\d{2})/);
      if(m){var v=parseFloat(m[1].replace(/\s/g,'').replace(',','.'));if(v>0&&prices.indexOf(v)===-1)prices.push(v);}
    });
    prices.sort(function(a,b){return a-b;});
    var finalPrice=prices.length?prices[0]:null;
    var origPrice=prices.length>1?prices[prices.length-1]:null;
    if(finalPrice===origPrice)origPrice=null;

    if(finalPrice){
      var key2=mainName+'||'+finalPrice;
      if(!P[key2]){
        P[key2]={name:mainName,price:finalPrice,price_original:origPrice,ref:'',ref_fabricant:'',brand:brand,category:category,sub_category:subCategory,discount:'',url:url};
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
  var withRef=0,withRefFab=0,withOrig=0;
  pr.forEach(function(p){if(p.ref)withRef++;if(p.ref_fabricant)withRefFab++;if(p.price_original)withOrig++;});
  l('Avec ref: '+withRef+', ref fabricant: '+withRefFab+', prix barre: '+withOrig);

  // Montrer des exemples
  console.log('Exemples:');
  for(var i=0;i<Math.min(10,pr.length);i++){
    var p=pr[i];
    console.log('  '+p.name.substring(0,60)+' | '+p.price+'EUR'+(p.price_original?' (barre:'+p.price_original+')':'')+' | ref:'+p.ref+' | fab:'+p.ref_fabricant+' | '+p.brand);
  }

  // Telecharger
  var blob=new Blob([JSON.stringify(pr,null,2)],{type:'application/json'});
  var a2=document.createElement('a');
  a2.href=URL.createObjectURL(blob);
  a2.download='dentalclick-v5-'+pr.length+'.json';
  a2.click();
  l('Fichier telecharge ! Importer sur jadomi.fr:');
  l('fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))');
  try{localStorage.removeItem('jadomi_dc5b');}catch(e){}
}

// LANCEMENT
l('=== DENTALCLICK v5.1 ===');
l('Parse titre depuis <title>, tableau TR/TD, refs fabricant');
collectUrls(function(){scrapeProducts();});

window.dc_status=function(){l(qi+'/'+productUrls.length+' fiches, '+Object.keys(P).length+' sous-refs, '+totalProducts+' produits');};
window.dc_stop=function(){done=true;finish();};
window.dc_reset=function(){localStorage.removeItem('jadomi_dc5b');l('Reset OK');};
window.dc_save=function(){save();l('Save OK');};
})();
