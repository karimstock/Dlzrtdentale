// =============================================
// JADOMI — Moteur de generation de sites clients
// Passe 38 — 24 avril 2026
// Genere les fichiers HTML/CSS a partir des templates + donnees BDD
// =============================================
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'themes');
const SITES_DIR = path.join(__dirname, '..', 'sites-clients');

// Remplacer les {{placeholders}} dans un template
function renderTemplate(template, data) {
  let html = template;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, value != null ? String(value) : '');
  }
  // Nettoyer les placeholders non remplaces
  html = html.replace(/\{\{[a-z_]+\}\}/g, '');
  return html;
}

// Generer les donnees de rendu a partir des sections BDD
function buildRenderData(site, sections, theme) {
  const data = {
    nom_cabinet: site.nom_affiche || 'Cabinet',
    slug: site.slug,
    url_jadomi: site.url_jadomi || 'https://jadomi.fr/sites/' + site.slug + '/',
    annee: new Date().getFullYear(),
    couleur_primaire: theme?.couleur_primaire || '#4A90E2',
    couleur_accent: theme?.couleur_accent || '#E8F1FB',
    typo_display: theme?.typo_display || 'Inter',
    typo_body: theme?.typo_body || 'Inter',
    slogan: '',
    description_courte: '',
    adresse: '',
    telephone: '',
    email: '',
    horaires_html: '',
    services_html: '',
    equipe_html: '',
    photo_hero: '',
    photo_cabinet: '',
    photo_equipe: '',
    logo_url: ''
  };

  // Remplir depuis les sections
  for (const sec of (sections || [])) {
    const val = sec.valeur || {};
    switch (sec.cle) {
      case 'hero':
        data.slogan = val.slogan || data.slogan;
        data.description_courte = val.description || data.description_courte;
        data.photo_hero = val.photo || data.photo_hero;
        break;
      case 'contact':
        data.adresse = val.adresse || data.adresse;
        data.telephone = val.telephone || data.telephone;
        data.email = val.email || data.email;
        break;
      case 'horaires':
        if (val.jours) {
          data.horaires_html = val.jours.map(j =>
            `<tr><td>${j.jour}</td><td>${j.ouvert ? j.heures : 'Ferme'}</td></tr>`
          ).join('');
        }
        break;
      case 'services':
        if (val.liste) {
          data.services_html = val.liste.map(s =>
            `<div class="service-card"><h3>${s.nom}</h3><p>${s.description || ''}</p></div>`
          ).join('');
        }
        break;
      case 'equipe':
        if (val.membres) {
          data.equipe_html = val.membres.map(m =>
            `<div class="team-card"><div class="team-avatar">${m.prenom ? m.prenom[0] : '?'}</div><h3>${m.prenom || ''} ${m.nom || ''}</h3><p>${m.titre || ''}</p></div>`
          ).join('');
        }
        break;
      case 'logo':
        data.logo_url = val.url || '';
        break;
      case 'about':
        if (!data.description_courte) data.description_courte = val.texte || '';
        break;
    }
  }

  return data;
}

// Generer le site complet
async function genererSite(siteId, supabase) {
  // 1. Charger site + sections + theme
  const { data: site, error: siteErr } = await supabase
    .from('sites_jadomi')
    .select('*')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) throw new Error('Site non trouve: ' + (siteErr?.message || siteId));

  const { data: sections } = await supabase
    .from('sites_jadomi_sections')
    .select('*')
    .eq('site_id', siteId)
    .order('ordre');

  const { data: theme } = await supabase
    .from('themes_sites')
    .select('*')
    .eq('code', site.theme_code)
    .single();

  // 2. Charger le template
  const themeDir = path.join(TEMPLATES_DIR, site.theme_code);
  const templatePath = path.join(themeDir, 'template.html');

  if (!fs.existsSync(templatePath)) {
    throw new Error('Template non trouve: ' + site.theme_code);
  }

  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  let styleCss = '';
  const stylePath = path.join(themeDir, 'style.css');
  if (fs.existsSync(stylePath)) styleCss = fs.readFileSync(stylePath, 'utf8');

  // 3. Rendre le template
  const renderData = buildRenderData(site, sections || [], theme);
  let html = renderTemplate(templateHtml, renderData);

  // Injecter le CSS si externe
  if (styleCss) {
    html = html.replace('</head>', `<style>${styleCss}</style>\n</head>`);
  }

  // 4. Ecrire dans /sites-clients/
  const siteDir = path.join(SITES_DIR, site.slug);
  if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), html, 'utf8');

  // Copier les assets du theme
  const themeAssetsDir = path.join(themeDir, 'assets');
  if (fs.existsSync(themeAssetsDir)) {
    const assetsTarget = path.join(siteDir, 'assets');
    if (!fs.existsSync(assetsTarget)) fs.mkdirSync(assetsTarget, { recursive: true });
    for (const f of fs.readdirSync(themeAssetsDir)) {
      fs.copyFileSync(path.join(themeAssetsDir, f), path.join(assetsTarget, f));
    }
  }

  // 5. Generer sitemap.xml
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${renderData.url_jadomi}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod></url>
</urlset>`;
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), sitemap, 'utf8');

  // 6. Mettre a jour statut
  const urlJadomi = 'https://jadomi.fr/sites/' + site.slug + '/';
  await supabase.from('sites_jadomi')
    .update({
      statut: 'en_ligne',
      url_jadomi: urlJadomi,
      mis_en_ligne_le: new Date().toISOString(),
      derniere_modif: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', siteId);

  // 7. Sauvegarder snapshot version
  await supabase.from('sites_jadomi_versions').insert({
    site_id: siteId,
    societe_id: site.societe_id,
    snapshot: { sections: sections, theme_code: site.theme_code, renderData },
    commentaire: 'Generation automatique'
  });

  return { success: true, url: urlJadomi, slug: site.slug };
}

// Regenerer (apres modification)
async function regenererSite(siteId, supabase, commentaire) {
  // Snapshot avant
  const { data: currentSections } = await supabase
    .from('sites_jadomi_sections').select('*').eq('site_id', siteId);
  const { data: site } = await supabase.from('sites_jadomi').select('societe_id').eq('id', siteId).single();

  if (site) {
    await supabase.from('sites_jadomi_versions').insert({
      site_id: siteId,
      societe_id: site.societe_id,
      snapshot: { sections: currentSections },
      commentaire: commentaire || 'Avant modification'
    });
  }

  return genererSite(siteId, supabase);
}

module.exports = { genererSite, regenererSite, renderTemplate, buildRenderData };
