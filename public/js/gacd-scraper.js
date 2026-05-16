// JADOMI — Scraper GACD COMPLET via Algolia v6 — par marque + tranche de prix
(function() {
  var cfg = window.algoliaConfig;
  if (!cfg) { alert('Erreur: ouvrez ce script sur gacd.fr'); return; }

  var appId = cfg.applicationId;
  var apiKey = cfg.apiKey;
  var indexName = cfg.indexName + '_products';
  var baseUrl = 'https://' + appId + '-dsn.algolia.net/1/indexes/' + indexName + '/query';

  var allProducts = {};
  var totalImported = 0;
  var startTime = Date.now();

  function statusMsg(msg) {
    var elapsed = Math.round((Date.now() - startTime) / 1000);
    var m = Math.floor(elapsed / 60);
    var s = elapsed % 60;
    var time = m + 'min' + (s < 10 ? '0' : '') + s;
    document.title = 'JADOMI ' + Object.keys(allProducts).length + ' produits [' + time + ']';
    console.log('[JADOMI ' + time + '] ' + msg);
  }

  function algoliaSearch(params) {
    return fetch(baseUrl, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': appId,
        'X-Algolia-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }).then(function(r) { return r.json(); });
  }

  function addHits(hits) {
    var added = 0;
    hits.forEach(function(h) {
      var price = null;
      if (h.price && h.price.EUR && h.price.EUR.default !== undefined) {
        price = h.price.EUR.default;
      }
      if (price === null || !h.name) return;
      var name = String(h.name);
      if (allProducts[name]) return;
      allProducts[name] = {
        name: name,
        price: price,
        brand: h.sap_mvgr3 || null,
        ref: Array.isArray(h.sku) ? h.sku[0] : (h.sku || null),
        category: Array.isArray(h.categories) ? h.categories.join(' > ') : null,
        url: h.url || null
      };
      added++;
    });
    return added;
  }

  function scrapeQuery(filters, numericFilters, page, callback) {
    var params = {
      query: '',
      hitsPerPage: 1000,
      page: page,
      attributesToRetrieve: ['name', 'price', 'sap_mvgr3', 'sku', 'categories', 'url']
    };
    if (filters) params.facetFilters = filters;
    if (numericFilters) params.numericFilters = numericFilters;

    algoliaSearch(params).then(function(data) {
      if (data.hits && data.hits.length > 0) {
        addHits(data.hits);
      }
      if (data.hits && data.hits.length === 1000 && (page + 1) * 1000 < 20000) {
        setTimeout(function() { scrapeQuery(filters, numericFilters, page + 1, callback); }, 150);
      } else {
        callback();
      }
    }).catch(function(e) {
      console.error('[JADOMI] Erreur:', e);
      callback();
    });
  }

  function start() {
    statusMsg('Récupération de toutes les marques...');
    algoliaSearch({
      query: '',
      hitsPerPage: 0,
      facets: ['sap_mvgr3'],
      maxValuesPerFacet: 1000
    }).then(function(data) {
      var brands = data.facets && data.facets['sap_mvgr3'];
      if (!brands) { alert('Erreur: pas de marques trouvées'); return; }

      var brandList = Object.keys(brands).map(function(b) {
        return { name: b, count: brands[b] };
      }).sort(function(a, b) { return b.count - a.count; });

      var totalProducts = 0;
      brandList.forEach(function(b) { totalProducts += b.count; });
      statusMsg(brandList.length + ' marques, ~' + totalProducts + ' produits');

      var smallBrands = [];
      var bigBrands = [];
      brandList.forEach(function(b) {
        if (b.count <= 1000) smallBrands.push(b);
        else bigBrands.push(b);
      });

      console.log('[JADOMI] ' + smallBrands.length + ' marques <= 1000 produits');
      console.log('[JADOMI] ' + bigBrands.length + ' marques > 1000 produits: ' +
        bigBrands.map(function(b) { return b.name + '(' + b.count + ')'; }).join(', '));

      // Scraper les petites marques
      scrapeSmallBrands(smallBrands, 0, function() {
        // Puis les grosses marques par tranche de prix
        scrapeBigBrands(bigBrands, 0, function() {
          // Enfin, un dernier passage sans filtre de marque pour attraper les produits sans marque
          statusMsg('Passage final: produits sans marque...');
          scrapeQuery(null, null, 0, finish);
        });
      });
    });
  }

  function scrapeSmallBrands(brands, idx, callback) {
    if (idx >= brands.length) { callback(); return; }
    var b = brands[idx];
    if (idx % 20 === 0 || b.count > 100) {
      statusMsg('Marque ' + (idx + 1) + '/' + brands.length + ': ' + b.name + ' (' + b.count + ')');
    }
    scrapeQuery([['sap_mvgr3:' + b.name]], null, 0, function() {
      // Petit délai tous les 50 marques pour ne pas surcharger
      var delay = (idx % 50 === 49) ? 500 : 50;
      setTimeout(function() { scrapeSmallBrands(brands, idx + 1, callback); }, delay);
    });
  }

  function scrapeBigBrands(brands, idx, callback) {
    if (idx >= brands.length) { callback(); return; }
    var b = brands[idx];
    statusMsg('Grande marque: ' + b.name + ' (' + b.count + ') — découpage par prix...');

    // Tranches de prix : 0-5, 5-10, 10-20, 20-50, 50-100, 100-200, 200-500, 500-2000, 2000+
    var ranges = [
      [0, 5], [5, 10], [10, 20], [20, 50], [50, 100],
      [100, 200], [200, 500], [500, 2000], [2000, 100000]
    ];

    scrapePriceRanges(b.name, ranges, 0, function() {
      scrapeBigBrands(brands, idx + 1, callback);
    });
  }

  function scrapePriceRanges(brand, ranges, idx, callback) {
    if (idx >= ranges.length) { callback(); return; }
    var r = ranges[idx];
    var label = brand + ' ' + r[0] + '-' + r[1] + '€';
    statusMsg(label + ' — ' + Object.keys(allProducts).length + ' uniques');

    var numFilter = ['price.EUR.default>=' + r[0], 'price.EUR.default<' + r[1]];
    scrapeQuery([['sap_mvgr3:' + brand]], numFilter, 0, function() {
      setTimeout(function() { scrapePriceRanges(brand, ranges, idx + 1, callback); }, 100);
    });
  }

  function finish() {
    var products = Object.values(allProducts);
    var elapsed = Math.round((Date.now() - startTime) / 1000);
    statusMsg('TERMINÉ! ' + products.length + ' produits uniques en ' + Math.round(elapsed / 60) + ' min. Envoi...');

    var chunkSize = 500;
    var chunks = [];
    for (var i = 0; i < products.length; i += chunkSize) {
      chunks.push(products.slice(i, i + chunkSize));
    }

    function sendChunk(idx) {
      if (idx >= chunks.length) {
        var finalElapsed = Math.round((Date.now() - startTime) / 1000);
        statusMsg('FAIT! ' + totalImported + '/' + products.length + ' importés en ' + Math.round(finalElapsed / 60) + ' min');
        alert('Import GACD terminé!\n\n' + totalImported + ' produits importés\n' + products.length + ' produits uniques trouvés\nDurée: ' + Math.round(finalElapsed / 60) + ' minutes');
        return;
      }

      if (idx % 5 === 0) {
        statusMsg('Envoi ' + (idx + 1) + '/' + chunks.length + ' — ' + totalImported + ' importés');
      }

      fetch('https://jadomi.fr/api/scan/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'gacd',
          products: chunks[idx],
          page: 'algolia-v6-batch-' + (idx + 1)
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        totalImported += d.imported || 0;
        sendChunk(idx + 1);
      })
      .catch(function(e) {
        console.error('[JADOMI] Erreur envoi lot ' + (idx + 1) + ':', e);
        sendChunk(idx + 1);
      });
    }

    sendChunk(0);
  }

  start();
})();
