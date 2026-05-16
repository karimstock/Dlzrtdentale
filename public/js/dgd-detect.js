var cats=[];
document.querySelectorAll('a').forEach(function(a){
  var h=a.href;
  if(h.indexOf('categorie_')>-1&&h.indexOf('.html')>-1) cats.push(h);
});
var u=[...new Set(cats)];
console.log(u.length+' categories');
console.log(u.join('\n'));
