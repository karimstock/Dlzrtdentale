var input=document.createElement('input');
input.type='file';
input.accept='.json';
input.onchange=function(){
  var r=new FileReader();
  r.onload=function(){
    var pr=JSON.parse(r.result);
    console.log(pr.length+' produits charges');
    var t=0;
    function s(i){
      if(i>=pr.length) return console.log('DONE: '+t+' importes !');
      fetch('/api/scan/import-prices',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({source:'dentalclick',products:pr.slice(i,i+500)})
      }).then(function(x){return x.json()})
      .then(function(x){t+=(x.imported||0);console.log('Lot '+(Math.ceil(i/500)+1)+': '+t);s(i+500)})
      .catch(function(e){console.log('err: '+e);s(i+500)});
    }
    s(0);
  };
  r.readAsText(input.files[0]);
};
input.click();
