const https = require('https');
const cheerio = require('cheerio');

const url = 'https://www.dentalgooddeal.com/categorie_ciments_66751.html';
console.log('Fetch:', url);

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' } }, (res) => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('HTTP:', res.statusCode, '| HTML:', html.length, 'chars');
    const $ = cheerio.load(html);

    // Liens gamme/article
    const links = [];
    $('a').each(function() {
      const href = $(this).attr('href') || '';
      if (href.includes('article_') || href.includes('gamme_')) links.push(href);
    });
    console.log('\nLiens gamme/article:', links.length);
    [...new Set(links)].slice(0, 5).forEach(l => console.log('  ', l.substring(0, 80)));

    // Gammes sur la page
    const gammes = [];
    $('.div_encars_gamme').each(function() {
      const name = $(this).find('.titre_gamme_liste_gamme, .divLibelleGamme, a').first().text().trim();
      const price = $(this).find('.gamme_prix').first().text().trim();
      if (name) gammes.push({ name: name.substring(0, 60), price });
    });
    console.log('\nGammes:', gammes.length);
    gammes.slice(0, 10).forEach(g => console.log('  ', g.name.padEnd(50), '→', g.price));

    // Titre page
    console.log('\nTitre:', $('title').text().trim().substring(0, 80));
    console.log('H1:', $('h1').first().text().trim().substring(0, 80));
  });
}).on('error', e => console.log('ERREUR:', e.message));
