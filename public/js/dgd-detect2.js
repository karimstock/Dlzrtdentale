var oc2=[];
document.querySelectorAll('[onclick]').forEach(function(e){
  var o=e.getAttribute('onclick');
  if(o.indexOf('Fiche')>-1||o.indexOf('Article')>-1||o.indexOf('Gamme')>-1||o.indexOf('gamme')>-1||o.indexOf('article')>-1){
    oc2.push(o.substring(0,200));
  }
});
console.log(oc2.length+' liens produits onclick');
console.log(oc2.slice(0,15).join('\n'));
