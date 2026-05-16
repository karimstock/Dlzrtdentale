const https = require('https');
const cheerio = require('cheerio');

function parsePrice(text) {
  if (!text) return null;
  const v = parseFloat(text.replace(/[^\d,.]/g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

const url = 'https://www.dentalgooddeal.com/article_ah_plus_jet__dentsply_sirona_160081_88176_62034.html';
console.log('Fetch:', url);

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0' } }, (res) => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    const $ = cheerio.load(html);
    const gammeTitle = $('h1').first().text().trim() || $('.titre_gamme').first().text().trim() || '';
    console.log('Titre:', gammeTitle);

    // article_prix (vrais prix)
    const articlePrices = [];
    $('.article_prix').each(function() { articlePrices.push(parsePrice($(this).text())); });
    const articleOldPrices = [];
    $('.article_prix_barre').each(function() { articleOldPrices.push(parsePrice($(this).text())); });
    console.log('\narticle_prix (VRAIS):', articlePrices);
    console.log('article_prix_barre:', articleOldPrices);

    // Refs
    const bodyText = $('body').text();
    const refMatches = bodyText.match(/Réf\.?\s*(\d{4,})/gi) || [];
    const refs = refMatches.map(m => m.replace(/Réf\.?\s*/i, '').trim());
    console.log('Refs fabricant:', refs);

    // Résultat final
    console.log('\n=== PRODUITS EXTRAITS ===');
    for (let i = 0; i < Math.max(articlePrices.length, refs.length); i++) {
      const ref = refs[i] || '';
      const price = articlePrices[i] || 'N/A';
      const old = articleOldPrices[i] || '';
      console.log('  Réf ' + ref + ' → ' + price + '€ HT' + (old ? ' (barré: ' + old + '€)' : ''));
    }
  });
}).on('error', e => console.log('ERR:', e.message));
