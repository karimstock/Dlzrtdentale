// =============================================
// JADOMI — Module Mon site internet
// public.js — Routes publiques (sans auth)
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { getPresignedUrl } = require('../../services/r2-storage');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

module.exports = function(router) {

  // ------------------------------------------
  // GET /public/site/:slug — Donnees du site publie ou preview
  // Si :slug = "preview-[uuid]" → preview authentifie (proprio uniquement)
  // Sinon → site public published par slug
  // ------------------------------------------
  router.get('/site/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      // Detecter mode preview : "preview-[uuid]"
      const previewMatch = slug.match(/^preview-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
      let site;

      if (previewMatch) {
        // --- MODE PREVIEW : acces par UUID (non devinable) ---
        // V1 : le UUID du site sert de token d'acces implicite
        // V2 : ajouter auth Bearer pour securisation complete
        const siteId = previewMatch[1];

        // Optionnel : verifier auth si token present
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (token) {
          const { data: userData, error: authErr } = await admin().auth.getUser(token);
          if (userData && userData.user) {
            // Verifier appartenance societe si auth presente
            const { data: siteCheck } = await admin()
              .from('vitrines_sites')
              .select('societe_id')
              .eq('id', siteId)
              .maybeSingle();
            if (siteCheck) {
              const { data: role } = await admin()
                .from('user_societe_roles')
                .select('role')
                .eq('user_id', userData.user.id)
                .eq('societe_id', siteCheck.societe_id)
                .maybeSingle();
              if (!role) return res.status(403).json({ error: 'forbidden_preview' });
            }
          }
        }

        // Recuperer le site (tous status, pas de filtre published)
        var siteFields = 'id, slug, societe_id, profession_id, palette, typography, languages, custom_domain, published_at, status, footer_pitch, metier_category, traitements, societes(nom, adresse, code_postal, ville, pays, telephone, email, siret, logo_url)';
        var { data: siteData, error: siteErr } = await admin()
          .from('vitrines_sites')
          .select(siteFields + ', theme_slug')
          .eq('id', siteId)
          .maybeSingle();
        // Fallback if theme_slug column doesn't exist yet (migration 18 not run)
        if (siteErr && siteErr.message && siteErr.message.includes('theme_slug')) {
          var fallback = await admin().from('vitrines_sites').select(siteFields).eq('id', siteId).maybeSingle();
          siteErr = fallback.error;
          siteData = fallback.data;
        }
        if (siteErr) throw siteErr;
        if (!siteData) return res.status(404).json({ error: 'Site introuvable' });

        site = siteData;
      } else {
        // --- MODE PUBLIC : slug + published ---
        var pubFields = 'id, slug, societe_id, profession_id, palette, typography, languages, custom_domain, published_at, status, footer_pitch, metier_category, traitements, societes(nom, adresse, code_postal, ville, pays, telephone, email, siret, logo_url)';
        var { data: siteData, error } = await admin()
          .from('vitrines_sites')
          .select(pubFields + ', theme_slug')
          .eq('slug', slug)
          .eq('status', 'published')
          .maybeSingle();
        if (error && error.message && error.message.includes('theme_slug')) {
          var pubFallback = await admin().from('vitrines_sites').select(pubFields).eq('slug', slug).eq('status', 'published').maybeSingle();
          error = pubFallback.error;
          siteData = pubFallback.data;
        }
        if (error) throw error;
        if (!siteData) return res.status(404).json({ error: 'Site introuvable' });

        site = siteData;
      }

      // Sections visibles
      const { data: sections } = await admin()
        .from('vitrines_sections')
        .select('type, position, content, ab_variant')
        .eq('site_id', site.id)
        .eq('is_visible', true)
        .order('position');

      // Medias avec URLs presignees (en preview, inclure non-valides RGPD aussi)
      let mediasQuery = admin()
        .from('vitrines_medias')
        .select('id, category, alt_text, position, width, height, storage_path')
        .eq('site_id', site.id)
        .order('category')
        .order('position');
      if (!previewMatch) {
        mediasQuery = mediasQuery.eq('rgpd_validated', true);
      }
      const { data: medias } = await mediasQuery;

      const mediasWithUrls = await Promise.all((medias || []).map(async (m) => {
        try {
          m.url = await getPresignedUrl(m.storage_path, 86400);
          delete m.storage_path;
        } catch (e) {
          m.url = null;
          delete m.storage_path;
        }
        return m;
      }));

      // Load theme data (from ?theme= query or site.theme_slug)
      var themeSlug = req.query.theme || site.theme_slug || null;
      var themeData = null;
      if (themeSlug) {
        try {
          var themeRes = await admin()
            .from('vitrines_themes')
            .select('slug, name, color_primary, color_primary_dark, color_secondary, color_text, color_text_muted, color_background, color_surface, color_border, color_footer_bg, color_footer_text, font_heading, font_body')
            .eq('slug', themeSlug)
            .eq('active', true)
            .maybeSingle();
          if (themeRes.data) themeData = themeRes.data;
        } catch (e) { /* theme table may not exist yet */ }
      }

      // Fetch extra societe columns (best-effort, columns added by migrations 11/19)
      var soc = site.societes || {};
      var extraSoc = {};
      try {
        var extraRes = await admin().from('societes').select('horaires, rpps, ordre_numero, barreau, numero_toque, assurance_rc, carpa, social_instagram, social_facebook, social_linkedin, secteur_conventionnel, footer_pitch, adresse_complement').eq('id', site.societe_id).maybeSingle();
        if (extraRes.data) extraSoc = extraRes.data;
      } catch (e) {
        // Fallback: try without adresse_complement (column may not exist yet)
        try {
          var fallbackRes = await admin().from('societes').select('horaires, rpps, ordre_numero, barreau, numero_toque, assurance_rc, carpa, social_instagram, social_facebook, social_linkedin, secteur_conventionnel, footer_pitch').eq('id', site.societe_id).maybeSingle();
          if (fallbackRes.data) extraSoc = fallbackRes.data;
        } catch (e2) { /* columns dont exist yet */ }
      }

      var flatSite = Object.assign({}, site, {
        societe_nom: soc.nom || '',
        societe_ville: soc.ville || '',
        societe_telephone: soc.telephone || '',
        societe_email: soc.email || '',
        adresse: soc.adresse || '',
        adresse_complement: extraSoc.adresse_complement || '',
        code_postal: soc.code_postal || '',
        ville: soc.ville || '',
        telephone: soc.telephone || '',
        email: soc.email || '',
        horaires: extraSoc.horaires || '',
        siret: soc.siret || '',
        rpps: extraSoc.rpps || '',
        ordre_numero: extraSoc.ordre_numero || '',
        barreau: extraSoc.barreau || '',
        numero_toque: extraSoc.numero_toque || '',
        assurance_rc: extraSoc.assurance_rc || '',
        carpa: extraSoc.carpa || '',
        social_instagram: extraSoc.social_instagram || '',
        social_facebook: extraSoc.social_facebook || '',
        social_linkedin: extraSoc.social_linkedin || '',
        logo_url: soc.logo_url || '',
        secteur_conventionnel: extraSoc.secteur_conventionnel || '',
        footer_pitch: site.footer_pitch || extraSoc.footer_pitch || ''
      });
      delete flatSite.societes; // remove nested object

      res.json({
        success: true,
        preview: !!previewMatch,
        site: flatSite,
        sections: sections || [],
        medias: mediasWithUrls,
        theme: themeData
      });
    } catch (err) {
      console.error('[vitrines/public]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /public/site/:slug/contact — Formulaire de contact
  // ------------------------------------------
  router.post('/site/:slug/contact', async (req, res) => {
    try {
      const { slug } = req.params;
      const { name, email, phone, motif, message, rgpd } = req.body;

      if (!name || !email || !message) {
        return res.status(400).json({ error: 'name, email et message requis' });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
      }

      // Supporter preview-uuid et slug normal
      let siteQuery = admin().from('vitrines_sites').select('id, societe_id');
      const previewMatch = slug.match(/^preview-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
      if (previewMatch) {
        siteQuery = siteQuery.eq('id', previewMatch[1]);
      } else {
        siteQuery = siteQuery.eq('slug', slug).eq('status', 'published');
      }
      const { data: site } = await siteQuery.maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      // Sauvegarder dans vitrines_contact_requests
      try {
        await admin().from('vitrines_contact_requests').insert({
          site_id: site.id,
          societe_id: site.societe_id,
          name: name,
          email: email,
          phone: phone || null,
          motif: motif || null,
          message: message,
          rgpd_consent: !!rgpd
        });
      } catch (dbErr) {
        console.warn('[vitrines/public] Erreur insert contact_requests:', dbErr.message);
      }

      const { data: societe } = await admin()
        .from('societes')
        .select('nom, email')
        .eq('id', site.societe_id)
        .single();

      if (!societe || !societe.email) {
        return res.status(400).json({ error: 'Aucune adresse email configuree pour ce professionnel' });
      }

      // Envoyer l'email
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'pro2.mail.ovh.net',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER || 'noreply@jadomi.fr',
          to: societe.email,
          replyTo: email,
          subject: '[JADOMI Site] Nouveau message de ' + name,
          html: `
            <h2>Nouveau message depuis votre site internet</h2>
            <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
            <p><strong>Email :</strong> ${escapeHtml(email)}</p>
            ${phone ? '<p><strong>Telephone :</strong> ' + escapeHtml(phone) + '</p>' : ''}
            <hr>
            <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
            <hr>
            <p style="color:#888;font-size:12px">Ce message a ete envoye depuis votre site internet JADOMI.</p>
          `
        });
      } catch (emailErr) {
        console.error('[vitrines/public] Erreur envoi email:', emailErr.message);
        // On ne bloque pas la reponse si l'email echoue
      }

      // Tracker le contact
      await trackEvent(site.id, 'contact_form');

      res.json({ success: true });
    } catch (err) {
      console.error('[vitrines/public]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /public/site/:slug/track — Analytics tracking
  // ------------------------------------------
  router.post('/site/:slug/track', async (req, res) => {
    try {
      const { slug } = req.params;
      const { event } = req.body; // 'page_view', 'contact_click', 'phone_click', 'rdv_click'

      if (!event) return res.status(400).json({ error: 'event requis' });

      const validEvents = ['page_view', 'contact_click', 'phone_click', 'rdv_click'];
      if (!validEvents.includes(event)) {
        return res.status(400).json({ error: 'event invalide' });
      }

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      await trackEvent(site.id, event);

      res.json({ success: true });
    } catch (err) {
      console.error('[vitrines/public]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};

// ------------------------------------------
// Helpers
// ------------------------------------------

async function trackEvent(siteId, event) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Upsert analytics pour aujourd'hui
    const { data: existing } = await admin()
      .from('vitrines_analytics')
      .select('*')
      .eq('site_id', siteId)
      .eq('date', today)
      .is('ab_variant_shown', null)
      .maybeSingle();

    if (existing) {
      const updates = {};
      switch (event) {
        case 'page_view': updates.page_views = (existing.page_views || 0) + 1; break;
        case 'contact_click':
        case 'contact_form': updates.contact_clicks = (existing.contact_clicks || 0) + 1; break;
        case 'phone_click': updates.phone_clicks = (existing.phone_clicks || 0) + 1; break;
        case 'rdv_click': updates.rdv_clicks = (existing.rdv_clicks || 0) + 1; break;
      }
      await admin()
        .from('vitrines_analytics')
        .update(updates)
        .eq('id', existing.id);
    } else {
      const row = {
        site_id: siteId,
        date: today,
        page_views: event === 'page_view' ? 1 : 0,
        contact_clicks: ['contact_click', 'contact_form'].includes(event) ? 1 : 0,
        phone_clicks: event === 'phone_click' ? 1 : 0,
        rdv_clicks: event === 'rdv_click' ? 1 : 0
      };
      await admin()
        .from('vitrines_analytics')
        .insert(row);
    }
  } catch (err) {
    console.warn('[vitrines/public] Erreur tracking:', err.message);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
