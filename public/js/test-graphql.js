// TEST GRAPHQL — Collez sur megadental.fr, doctor-ai.fr ou doctorstrong.fr
// Ce script teste si le GraphQL donne les noms et prix des produits
fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '{ products(search: "gants", pageSize: 5) { total_count items { name sku price_range { minimum_price { regular_price { value currency } final_price { value } discount { percent_off } } } } } }'
  })
}).then(function(r) { return r.json(); }).then(function(d) {
  if (d.data && d.data.products) {
    console.log('TOTAL PRODUITS pour "gants":', d.data.products.total_count);
    console.log('Produits:');
    (d.data.products.items || []).forEach(function(i) {
      console.log('  SKU=' + (i.sku||'?') + ' | ' + (i.price_range?.minimum_price?.final_price?.value||'?') + 'EUR | ' + (i.name||'?'));
    });
    if (d.data.products.total_count > 0 && d.data.products.items[0].name) {
      console.log('');
      console.log('GRAPHQL FONCTIONNE! On peut recuperer TOUS les produits via cette methode.');
      console.log('Nombre total disponible: ' + d.data.products.total_count);
    } else {
      console.log('');
      console.log('GraphQL repond mais les valeurs sont null. Essayez en etant connecte.');
    }
  } else {
    console.log('GraphQL erreur:', JSON.stringify(d).substring(0, 300));
  }
}).catch(function(e) { console.log('ERREUR:', e.message); });
