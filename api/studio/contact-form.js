// =============================================
// JADOMI Studio — Formulaire de contact sites vitrines
// Endpoints publics pour recevoir les messages des visiteurs
// + endpoint auth pour consulter les soumissions
// Routes /api/sites/contact/*
// =============================================
'use strict';

const express = require('express');
const nodemailer = require('nodemailer');

// ---- Rate limiter en memoire (IP -> timestamps) ----
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure

// Nettoyage periodique toutes les 10 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, stamps] of rateLimitMap) {
    const fresh = stamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, fresh);
  }
}, 10 * 60 * 1000);

/**
 * Supprime les balises HTML pour eviter le XSS
 */
function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * Validation email basique
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Verifie le rate limit pour une IP
 * @returns {boolean} true si autorise, false si limite atteinte
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const stamps = rateLimitMap.get(ip) || [];
  const fresh = stamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, fresh);
    return false;
  }

  fresh.push(now);
  rateLimitMap.set(ip, fresh);
  return true;
}

/**
 * Cree le transporteur SMTP (singleton)
 */
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro2.mail.ovh.net',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return _transporter;
}

module.exports = function mountContactForm(app, supabase) {
  const router = express.Router();

  // ================================================
  // POST /api/sites/contact/submit
  // PUBLIC — reception message visiteur
  // ================================================
  router.post('/submit', async (req, res) => {
    try {
      const body = req.body || {};

      // --- Honeypot anti-bot ---
      if (body.website && body.website.trim().length > 0) {
        // Bot detecte : reponse silencieuse OK pour ne pas alerter le bot
        return res.json({ ok: true, message: 'Votre message a bien ete envoye.' });
      }

      // --- Rate limit par IP ---
      const clientIp = req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || req.connection.remoteAddress || '0.0.0.0';

      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          ok: false,
          error: 'Vous avez envoye trop de messages. Veuillez reessayer dans une heure.'
        });
      }

      // --- Validation et sanitisation ---
      const slug = stripHtml(body.slug || '');
      const name = stripHtml(body.name || '');
      const email = stripHtml(body.email || '');
      const phone = stripHtml(body.phone || '');
      const message = stripHtml(body.message || '');

      if (!slug) {
        return res.status(400).json({ ok: false, error: 'Identifiant du site manquant.' });
      }
      if (!name || name.length < 2) {
        return res.status(400).json({ ok: false, error: 'Veuillez indiquer votre nom.' });
      }
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ ok: false, error: 'Veuillez indiquer une adresse email valide.' });
      }
      if (!message || message.length < 10) {
        return res.status(400).json({ ok: false, error: 'Votre message doit contenir au moins 10 caracteres.' });
      }
      if (name.length > 200 || email.length > 320 || phone.length > 30 || message.length > 5000) {
        return res.status(400).json({ ok: false, error: 'Un ou plusieurs champs depassent la taille maximale autorisee.' });
      }

      // --- Trouver le site et le proprietaire ---
      const { data: site, error: siteErr } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id, nom_affiche, slug')
        .eq('slug', slug)
        .single();

      if (siteErr || !site) {
        return res.status(404).json({ ok: false, error: 'Site introuvable.' });
      }

      // Trouver l'email du proprietaire via user_societe_roles + auth
      let ownerEmail = null;
      const { data: ownerRole } = await supabase
        .from('user_societe_roles')
        .select('user_id')
        .eq('societe_id', site.societe_id)
        .in('role', ['owner', 'admin'])
        .limit(1)
        .single();

      if (ownerRole && ownerRole.user_id) {
        const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(ownerRole.user_id);
        if (ownerUser) ownerEmail = ownerUser.email;
      }

      // --- Stocker la soumission ---
      const { error: insertErr } = await supabase
        .from('site_contact_submissions')
        .insert({
          societe_id: site.societe_id,
          site_slug: slug,
          name,
          email,
          phone: phone || null,
          message,
          ip: clientIp,
          created_at: new Date().toISOString()
        });

      if (insertErr) {
        console.error('[contact-form] Erreur insertion:', insertErr.message);
        return res.status(500).json({ ok: false, error: 'Erreur lors de l\'enregistrement de votre message.' });
      }

      // --- Envoyer l'email de notification au proprietaire ---
      if (ownerEmail) {
        try {
          const transport = getTransporter();
          const siteName = site.nom_affiche || site.slug;

          await transport.sendMail({
            from: `"JADOMI" <${process.env.SMTP_USER || 'noreply@jadomi.fr'}>`,
            to: ownerEmail,
            replyTo: email,
            subject: `Nouveau message via votre site ${siteName}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #111827; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Nouveau message de contact</h2>
                  <p style="margin: 8px 0 0; opacity: 0.7; font-size: 14px;">Via ${siteName}</p>
                </div>
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Nom</td>
                      <td style="padding: 8px 0; font-weight: 500;">${name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
                      <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td>
                    </tr>
                    ${phone ? `<tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Telephone</td>
                      <td style="padding: 8px 0;">${phone}</td>
                    </tr>` : ''}
                  </table>
                  <div style="margin-top: 16px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2563eb;">
                    <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${message}</p>
                  </div>
                  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                    Vous pouvez repondre directement a cet email pour contacter ${name}.
                  </p>
                </div>
              </div>
            `
          });
        } catch (mailErr) {
          // Ne pas bloquer la soumission si l'email echoue
          console.error('[contact-form] Erreur envoi email:', mailErr.message);
        }
      }

      return res.json({ ok: true, message: 'Votre message a bien ete envoye.' });

    } catch (err) {
      console.error('[contact-form] Erreur submit:', err.message);
      return res.status(500).json({ ok: false, error: 'Une erreur est survenue. Veuillez reessayer.' });
    }
  });

  // ================================================
  // GET /api/sites/contact/submissions/:site_id
  // AUTH — liste des soumissions pour un site
  // ================================================
  router.get('/submissions/:site_id', async (req, res) => {
    try {
      // --- Auth ---
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });

      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Token invalide' });

      // Trouver la societe de l'utilisateur
      const societeId = req.headers['x-societe-id'];
      let userSocieteId = null;

      if (societeId) {
        const { data: role } = await supabase.from('user_societe_roles')
          .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
        if (role) userSocieteId = role.societe_id;
      }
      if (!userSocieteId) {
        const { data: first } = await supabase.from('user_societe_roles')
          .select('societe_id').eq('user_id', user.id).limit(1).single();
        if (first) userSocieteId = first.societe_id;
      }
      if (!userSocieteId) {
        return res.status(400).json({ error: 'Aucune organisation associee.' });
      }

      // Verifier que le site appartient a la societe
      const siteId = req.params.site_id;
      const { data: site, error: siteErr } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id')
        .eq('id', siteId)
        .eq('societe_id', userSocieteId)
        .single();

      if (siteErr || !site) {
        return res.status(404).json({ error: 'Site introuvable ou acces refuse.' });
      }

      // Pagination
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      // Recuperer les soumissions
      const { data: submissions, error: fetchErr, count } = await supabase
        .from('site_contact_submissions')
        .select('id, name, email, phone, message, created_at', { count: 'exact' })
        .eq('site_slug', site.id)
        .eq('societe_id', userSocieteId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (fetchErr) {
        console.error('[contact-form] Erreur fetch submissions:', fetchErr.message);
        return res.status(500).json({ error: 'Erreur lors de la recuperation des messages.' });
      }

      return res.json({
        ok: true,
        submissions: submissions || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      });

    } catch (err) {
      console.error('[contact-form] Erreur submissions:', err.message);
      return res.status(500).json({ error: 'Une erreur est survenue.' });
    }
  });

  // Monter le router
  app.use('/api/sites/contact', router);
};
