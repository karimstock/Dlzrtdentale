// =============================================
// JADOMI Studio V2 — API Mémoire Marque
// CRUD entreprise + analyse site web + fiche marque
// =============================================

const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');

// ── GET /mon-profil — Récupérer la fiche marque de l'utilisateur ──
router.get('/mon-profil', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('studio_entreprises')
      .select('*, studio_produits(*), studio_assets(id, type, nom, fichier_url, statut, format, transparent)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ ok: true, entreprise: data || null });
  } catch (e) {
    console.error('[MARQUE] mon-profil error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST / — Créer ou mettre à jour la fiche marque ──
router.post('/', async (req, res) => {
  try {
    const {
      nom, site_internet, domaine_medical, specialite,
      logo_url, couleurs, typographies, ton, style_visuel,
      slogan, description, pays, langues, reseaux_sociaux,
      preferences, societe_id, rgpd_consent,
    } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({ ok: false, error: 'Le nom de l\'entreprise est requis' });
    }

    // Vérifier si profil existant
    const { data: existing } = await req.supabase
      .from('studio_entreprises')
      .select('id')
      .eq('user_id', req.user.id)
      .limit(1)
      .single();

    const payload = {
      nom: nom.trim(),
      site_internet: site_internet || null,
      domaine_medical: domaine_medical || null,
      specialite: specialite || null,
      logo_url: logo_url || null,
      couleurs: couleurs || {},
      typographies: typographies || {},
      ton: ton || 'professionnel',
      style_visuel: style_visuel || 'moderne',
      slogan: slogan || null,
      description: description || null,
      pays: pays || 'FR',
      langues: langues || ['fr'],
      reseaux_sociaux: reseaux_sociaux || {},
      preferences: preferences || {},
      societe_id: societe_id || null,
      rgpd_consent: rgpd_consent || false,
      rgpd_consent_date: rgpd_consent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // Update
      const { data, error } = await req.supabase
        .from('studio_entreprises')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      // Insert
      payload.user_id = req.user.id;
      const { data, error } = await req.supabase
        .from('studio_entreprises')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    res.json({ ok: true, entreprise: result });
  } catch (e) {
    console.error('[MARQUE] create/update error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /analyser-site — Analyse automatique du site web ──
router.post('/analyser-site', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ ok: false, error: 'URL requise' });
    }

    // Normaliser URL
    let siteUrl = url.trim();
    if (!siteUrl.startsWith('http')) siteUrl = 'https://' + siteUrl;

    // Protection SSRF
    const urlObj = new URL(siteUrl);
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'];
    if (blockedHosts.includes(urlObj.hostname) || urlObj.hostname.startsWith('10.') || urlObj.hostname.startsWith('192.168.')) {
      return res.status(400).json({ ok: false, error: 'URL non autorisée' });
    }

    // Fetch le site
    const https = require('https');
    const http = require('http');
    const fetcher = siteUrl.startsWith('https') ? https : http;

    const html = await new Promise((resolve, reject) => {
      const request = fetcher.get(siteUrl, {
        headers: { 'User-Agent': 'JADOMI Studio Bot/1.0 (+https://jadomi.fr)' },
        timeout: 15000,
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Suivre 1 redirection
          fetcher.get(response.headers.location, { timeout: 15000 }, (r2) => {
            let data = '';
            r2.on('data', c => data += c);
            r2.on('end', () => resolve(data));
          }).on('error', reject);
          return;
        }
        let data = '';
        response.on('data', c => data += c);
        response.on('end', () => resolve(data));
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });

    // Parser avec Cheerio
    const $ = cheerio.load(html);
    const analyse = {
      titre: $('title').text().trim() || null,
      meta_description: $('meta[name="description"]').attr('content') || null,
      meta_keywords: $('meta[name="keywords"]').attr('content') || null,
      og_image: $('meta[property="og:image"]').attr('content') || null,
      favicon: $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || null,
      h1: [],
      h2: [],
      images: [],
      liens_sociaux: {},
      couleurs_detectees: [],
      texte_principal: '',
    };

    // H1 et H2
    $('h1').each((_, el) => { const t = $(el).text().trim(); if (t) analyse.h1.push(t); });
    $('h2').each((_, el) => { const t = $(el).text().trim(); if (t && analyse.h2.length < 10) analyse.h2.push(t); });

    // Images (max 20)
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || '';
      if (src && analyse.images.length < 20) {
        const fullSrc = src.startsWith('http') ? src : new URL(src, siteUrl).href;
        analyse.images.push({ src: fullSrc, alt });
      }
    });

    // Liens réseaux sociaux
    const socialPatterns = {
      linkedin: /linkedin\.com/i,
      instagram: /instagram\.com/i,
      facebook: /facebook\.com/i,
      youtube: /youtube\.com/i,
      twitter: /twitter\.com|x\.com/i,
      tiktok: /tiktok\.com/i,
    };
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      for (const [network, pattern] of Object.entries(socialPatterns)) {
        if (pattern.test(href) && !analyse.liens_sociaux[network]) {
          analyse.liens_sociaux[network] = href;
        }
      }
    });

    // Couleurs CSS (inline styles + classes)
    const colorRegex = /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)/g;
    const allStyles = [];
    $('[style]').each((_, el) => allStyles.push($(el).attr('style')));
    $('style').each((_, el) => allStyles.push($(el).html()));
    const colors = new Set();
    for (const style of allStyles) {
      if (!style) continue;
      const matches = style.match(colorRegex);
      if (matches) matches.forEach(c => colors.add(c.toLowerCase()));
    }
    analyse.couleurs_detectees = [...colors].slice(0, 20);

    // Texte principal (body, nettoyé)
    $('script, style, nav, footer, header').remove();
    analyse.texte_principal = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 2000);

    // Sauvegarder l'analyse dans le profil entreprise
    const { data: existing } = await req.supabase
      .from('studio_entreprises')
      .select('id')
      .eq('user_id', req.user.id)
      .limit(1)
      .single();

    if (existing) {
      await req.supabase
        .from('studio_entreprises')
        .update({
          site_internet: siteUrl,
          site_analyse: analyse,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }

    res.json({ ok: true, analyse });
  } catch (e) {
    console.error('[MARQUE] analyser-site error:', e.message);
    res.status(500).json({ ok: false, error: 'Impossible d\'analyser le site : ' + e.message });
  }
});

// ── GET /templates — Liste des templates disponibles ──
router.get('/templates', async (req, res) => {
  try {
    const { categorie, type, style, specialite, niveau } = req.query;

    let query = req.supabase
      .from('studio_templates')
      .select('*')
      .eq('actif', true)
      .order('ordre', { ascending: true })
      .order('nom', { ascending: true });

    if (categorie) query = query.eq('categorie', categorie);
    if (type) query = query.eq('type', type);
    if (style) query = query.eq('style', style);
    if (niveau) query = query.eq('niveau', niveau);
    if (specialite) query = query.contains('specialite_medicale', [specialite]);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, templates: data || [] });
  } catch (e) {
    console.error('[MARQUE] templates error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /templates/:id — Détail d'un template ──
router.get('/templates/:id', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('studio_templates')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json({ ok: true, template: data });
  } catch (e) {
    res.status(404).json({ ok: false, error: 'Template non trouvé' });
  }
});

// ── POST /produits — Ajouter un produit ──
router.post('/produits', async (req, res) => {
  try {
    const { entreprise_id, nom, categorie, description, arguments_commerciaux, benefices_cliniques, cible, prix_indicatif } = req.body;

    if (!entreprise_id || !nom) {
      return res.status(400).json({ ok: false, error: 'entreprise_id et nom requis' });
    }

    // Vérifier ownership
    const { data: ent } = await req.supabase
      .from('studio_entreprises')
      .select('id')
      .eq('id', entreprise_id)
      .eq('user_id', req.user.id)
      .single();

    if (!ent) return res.status(403).json({ ok: false, error: 'Entreprise non trouvée' });

    const { data, error } = await req.supabase
      .from('studio_produits')
      .insert({
        entreprise_id,
        nom: nom.trim(),
        categorie: categorie || null,
        description: description || null,
        arguments_commerciaux: arguments_commerciaux || [],
        benefices_cliniques: benefices_cliniques || [],
        cible: cible || null,
        prix_indicatif: prix_indicatif || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, produit: data });
  } catch (e) {
    console.error('[MARQUE] produit create error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /produits — Lister les produits de l'entreprise ──
router.get('/produits', async (req, res) => {
  try {
    const { entreprise_id } = req.query;
    if (!entreprise_id) return res.status(400).json({ ok: false, error: 'entreprise_id requis' });

    const { data, error } = await req.supabase
      .from('studio_produits')
      .select('*, studio_assets(id, type, nom, fichier_url, statut, transparent)')
      .eq('entreprise_id', entreprise_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, produits: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /historique — Dernières générations ──
router.get('/historique', async (req, res) => {
  try {
    const { entreprise_id, limit: lim } = req.query;
    if (!entreprise_id) return res.status(400).json({ ok: false, error: 'entreprise_id requis' });

    const { data, error } = await req.supabase
      .from('studio_generations')
      .select('*, studio_templates(nom, type, categorie)')
      .eq('entreprise_id', entreprise_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(lim) || 50);

    if (error) throw error;
    res.json({ ok: true, generations: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
