// JADOMI — Scraper Mega Dental COMPLET via XHR (même domaine)
// Tout se fait en mémoire, pas de navigation entre pages
(function() {
  var allProducts = {};
  var startTime = Date.now();

  var CATEGORIES = [
    '/usage-unique.html',
    '/instrumentation.html',
    '/restauration.html',
    '/equipement.html',
    '/specialites.html',
    '/divers-4/radiographie.html',
    '/dermo-cosmetique.html',
    '/produits-liberte.html',
    '/offres-fabricants.html',
    '/offres-lots.html',
    '/destockage.html'
  ];

  function status(msg) {
    var s = Math.round((Date.now() - startTime) / 1000);
    document.title = 'JADOMI: ' + Object.keys(allProducts).length + ' produits [' + s + 's]';
    console.log('[JADOMI ' + s + 's] ' + msg);
  }

  function fetchPage(url, callback) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = function() {
      if (x.status === 200) {
        callback(x.responseText);
      } else {
        callback(null);
      }
    };
    x.onerror = function() { callback(null); };
    x.send();
  }

  function parseProducts(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var added = 0;
    doc.querySelectorAll('.product-item').forEach(function(e) {
      var a = e.querySelector('.product-item-link');
      var p = e.querySelector('.price');
      var pr = p ? parseFloat(p.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')) : null;
      var nm = a ? (a.getAttribute('aria-label') || a.textContent.trim().split('\n')[0].trim()) : '';
      if (nm && nm.length > 3 && pr !== null && !allProducts[nm]) {
        allProducts[nm] = { name: nm, price: pr };
        added++;
      }
    });
    return added;
  }

  function findLastPage(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var pages = doc.querySelectorAll('.pages-item-previous ~ .item a, .pages a');
    var max = 1;
    pages.forEach(function(a) {
      var n = parseInt(a.textContent.trim());
      if (n > max) max = n;
    });
    return max;
  }

  function scrapeCategory(catUrl, callback) {
    var fullUrl = 'https://www.megadental.fr' + catUrl;
    status('Catégorie: ' + catUrl);

    fetchPage(fullUrl, function(html) {
      if (!html) { callback(); return; }

      var added = parseProducts(html);
      var lastPage = findLastPage(html);
      status(catUrl + ' — page 1/' + lastPage + ' (+' + added + ')');

      if (lastPage <= 1) { callback(); return; }

      // Charger les pages 2 à lastPage
      var currentPage = 2;
      function nextPage() {
        if (currentPage > lastPage) { callback(); return; }
        var pageUrl = fullUrl + '?p=' + currentPage;
        fetchPage(pageUrl, function(h) {
          if (h) {
            var a = parseProducts(h);
            status(catUrl + ' — page ' + currentPage + '/' + lastPage + ' (+' + a + ')');
          }
          currentPage++;
          setTimeout(nextPage, 300);
        });
      }
      nextPage();
    });
  }

  function scrapeAll() {
    var idx = 0;
    function next() {
      if (idx >= CATEGORIES.length) {
        finish();
        return;
      }
      scrapeCategory(CATEGORIES[idx], function() {
        idx++;
        next();
      });
    }
    status('Démarrage — ' + CATEGORIES.length + ' catégories');
    next();
  }

  function finish() {
    var products = Object.values(allProducts);
    var elapsed = Math.round((Date.now() - startTime) / 1000);
    status('TERMINÉ! ' + products.length + ' produits en ' + elapsed + 's');

    var payload = JSON.stringify({source: 'megadental', products: products, page: 'mega-auto-all'});

    if (navigator.clipboard) {
      navigator.clipboard.writeText(payload).then(function() {
        console.log('[JADOMI] Données copiées dans le presse-papier!');
        window.open('https://jadomi.fr/import-relay.html');
        alert('JADOMI Mega Dental: ' + products.length + ' produits!\n\nCollez (Ctrl+V) dans la zone texte de la page qui vient de s\'ouvrir, puis cliquez Importer.');
      }).catch(function() {
        console.log('[JADOMI] Clipboard bloqué, envoi direct...');
        sendDirect(products, elapsed);
      });
    } else {
      sendDirect(products, elapsed);
    }
  }

  function sendDirect(products, elapsed) {
    // Fallback: envoyer directement via une nouvelle fenêtre
    var w = window.open('https://jadomi.fr/import-relay.html');
    setTimeout(function() {
      w.postMessage({jadomi: true, payload: JSON.stringify({source:'megadental',products:products,page:'mega-auto-all'})}, 'https://jadomi.fr');
      alert('JADOMI: ' + products.length + ' produits envoyés via postMessage');
    }, 3000);
  }

  scrapeAll();
})();
