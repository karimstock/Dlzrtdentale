// =============================================
// JADOMI Studio — Orchestrateur Site Complet
// Pipeline automatique post-paiement :
//   1. Achat domaine OVH
//   2. Configuration DNS (A + MX)
//   3. Génération site HTML
//   4. Setup Nginx + SSL
//   5. Création boîte(s) mail
//   6. Email de bienvenue au client
// Routes /api/studio/orchestrator/*
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const path = require('path');
const { getOvhClient } = require('../../lib/ovh-client');
const { genererSite } = require('../../services/site-generator');

const VPS_IP = '141.94.10.182';
const SETUP_SCRIPT = path.join(__dirname, '../../scripts/setup-client-domain.sh');

// Nombre de boîtes mail par formule
const MAIL_QUOTAS = {
  classic: 1,   // 1 boîte : contact@
  pro: 3,       // 3 boîtes : contact@, info@, rdv@
  expert: 5     // 5 boîtes : contact@, info@, rdv@, facturation@, direction@
};

const DEFAULT_ACCOUNTS = {
  classic: ['contact'],
  pro: ['contact', 'info', 'rdv'],
  expert: ['contact', 'info', 'rdv', 'facturation', 'direction']
};

module.exports = function mountOrchestrator(app, supabase, requireAuth) {

  // ================================================
  // POST /api/studio/orchestrator/provision
  // Pipeline complet : domaine → DNS → site → nginx → mail → email
  // Body : { site_id, domain, formule: "classic|pro|expert", mail_accounts?: ["contact","info"] }
  // ================================================
  router.post('/provision', requireAuth, async (req, res) => {
    try {
      const { site_id, domain, formule, mail_accounts } = req.body || {};
      if (!site_id || !domain || !formule) {
        return res.status(400).json({ error: 'site_id, domain et formule requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      // Vérifier que le site appartient à l'utilisateur
      const { data: site, error: siteErr } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id, slug, nom_affiche')
        .eq('id', site_id)
        .eq('societe_id', req.societeId)
        .single();
      if (siteErr || !site) {
        return res.status(404).json({ error: 'Site introuvable' });
      }

      // Vérifier pas de doublon
      const { data: existant } = await supabase
        .from('site_hebergements')
        .select('id')
        .eq('domain', domainPropre)
        .neq('statut', 'cancelled')
        .maybeSingle();
      if (existant) {
        return res.status(409).json({ error: 'Ce domaine est déjà utilisé' });
      }

      // Créer l'entrée hébergement
      const { data: hebergement, error: insertErr } = await supabase
        .from('site_hebergements')
        .insert({
          site_id,
          societe_id: req.societeId,
          domain: domainPropre,
          plan: formule,
          statut: 'provisioning',
          provider: 'ovh',
          mode: 'production',
          created_by: req.userId
        })
        .select()
        .single();

      if (insertErr) {
        return res.status(500).json({ error: 'Erreur création hébergement' });
      }

      // Répondre immédiatement, le reste se fait en async
      res.json({
        ok: true,
        hebergement_id: hebergement.id,
        domain: domainPropre,
        statut: 'provisioning',
        message: 'Provisioning en cours. Suivez le statut via /api/studio/ovh/status/' + site_id
      });

      // === PIPELINE ASYNC ===
      runProvisionPipeline(ovh, supabase, {
        hebergementId: hebergement.id,
        siteId: site_id,
        slug: site.slug,
        domain: domainPropre,
        formule,
        nomCabinet: site.nom_affiche || 'Cabinet',
        mailAccounts: mail_accounts || DEFAULT_ACCOUNTS[formule] || ['contact'],
        userEmail: req.userEmail
      }).catch(err => {
        console.error('[Orchestrator] Pipeline error:', err.message);
      });

    } catch (err) {
      console.error('[Orchestrator] provision error:', err.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erreur orchestrateur' });
      }
    }
  });

  // ================================================
  // POST /api/studio/orchestrator/retry-ssl
  // Relancer uniquement le SSL (si DNS pas encore propagé)
  // Body : { domain, slug }
  // ================================================
  router.post('/retry-ssl', requireAuth, async (req, res) => {
    try {
      const { domain, slug } = req.body || {};
      if (!domain || !slug) return res.status(400).json({ error: 'domain et slug requis' });

      const result = await runNginxSetup(domain, slug);
      return res.json({ ok: true, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/orchestrator/retry-mail
  // Relancer uniquement la création mail (si service pas encore prêt)
  // Body : { domain, accounts: ["contact","info"] }
  // ================================================
  router.post('/retry-mail', requireAuth, async (req, res) => {
    try {
      const { domain, accounts } = req.body || {};
      if (!domain || !accounts) return res.status(400).json({ error: 'domain et accounts requis' });

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const results = await createMailAccounts(ovh, domain, accounts, 'Cabinet');
      return res.json({ ok: true, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/orchestrator/status/:site_id
  // Statut détaillé du provisioning
  // ================================================
  router.get('/status/:site_id', requireAuth, async (req, res) => {
    try {
      const { data: hebergement } = await supabase
        .from('site_hebergements')
        .select('*')
        .eq('site_id', req.params.site_id)
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!hebergement) {
        return res.json({ hebergement: null });
      }

      return res.json({
        hebergement,
        statut: hebergement.statut,
        domain: hebergement.domain,
        url: hebergement.url || null
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erreur statut' });
    }
  });

  app.use('/api/studio/orchestrator', router);
};

// === PIPELINE ASYNC ===

async function runProvisionPipeline(ovh, supabase, opts) {
  const { hebergementId, siteId, slug, domain, formule, nomCabinet, mailAccounts, userEmail } = opts;
  const log = (msg) => console.log(`[Orchestrator] [${domain}] ${msg}`);

  async function updateStatus(statut, extra) {
    const updates = { statut, updated_at: new Date().toISOString(), ...extra };
    await supabase.from('site_hebergements').update(updates).eq('id', hebergementId);
  }

  try {
    // === ÉTAPE 1 : Achat domaine ===
    log('Étape 1 — Achat domaine...');
    await updateStatus('provisioning');

    const cart = await ovh.requestPromised('POST', '/order/cart', {
      ovhSubsidiary: 'FR',
      description: 'JADOMI ' + slug
    });
    await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);
    await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/domain`, { domain });
    const order = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/checkout`, {
      autoPayWithPreferredPaymentMethod: true,
      waiveRetractationPeriod: true
    });
    log(`Commande ${order.orderId} créée`);

    // === ÉTAPE 2 : Attente zone DNS ===
    log('Étape 2 — Attente zone DNS...');
    await updateStatus('configuring');

    let zoneReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        await ovh.requestPromised('GET', `/domain/zone/${domain}`);
        zoneReady = true;
        break;
      } catch (_) {
        log(`Zone pas prête, tentative ${i + 1}/30...`);
        await sleep(10000); // 10 sec entre chaque essai
      }
    }

    if (!zoneReady) {
      log('Zone DNS non disponible après 5 min. Le DNS sera configuré plus tard.');
      await updateStatus('dns_pending');
      return;
    }

    // === ÉTAPE 3 : Configuration DNS ===
    log('Étape 3 — Configuration DNS...');

    // A records
    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
        fieldType: 'A', subDomain: '', target: VPS_IP, ttl: 3600
      });
    } catch (_) {}

    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
        fieldType: 'A', subDomain: 'www', target: VPS_IP, ttl: 3600
      });
    } catch (_) {}

    // MX records
    const mxTargets = [
      '0 mx0.mail.ovh.net.', '10 mx1.mail.ovh.net.', '20 mx2.mail.ovh.net.',
      '30 mx3.mail.ovh.net.', '40 mx4.mail.ovh.net.'
    ];
    for (const target of mxTargets) {
      try {
        await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
          fieldType: 'MX', subDomain: '', target, ttl: 86400
        });
      } catch (_) {}
    }

    // SPF + autodiscover
    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
        fieldType: 'TXT', subDomain: '', target: '"v=spf1 include:mx.ovh.com ~all"', ttl: 3600
      });
    } catch (_) {}
    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
        fieldType: 'SRV', subDomain: '_autodiscover._tcp',
        target: '0 0 443 autodiscover.mail.ovh.net.', ttl: 86400
      });
    } catch (_) {}
    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
        fieldType: 'CNAME', subDomain: 'autoconfig',
        target: 'autodiscover.mail.ovh.net.', ttl: 3600
      });
    } catch (_) {}

    // Refresh zone
    try {
      await ovh.requestPromised('POST', `/domain/zone/${domain}/refresh`);
    } catch (_) {}

    log('DNS configuré');

    // === ÉTAPE 4 : Génération du site HTML ===
    log('Étape 4 — Génération site HTML...');
    await updateStatus('deploying');

    try {
      await genererSite(siteId, supabase);
      log('Site HTML généré');
    } catch (e) {
      log('Erreur génération site: ' + e.message);
    }

    // === ÉTAPE 5 : Setup Nginx + SSL ===
    log('Étape 5 — Setup Nginx...');
    try {
      await runNginxSetup(domain, slug);
      log('Nginx configuré');
    } catch (e) {
      log('Erreur Nginx: ' + e.message + ' (SSL sera configuré manuellement)');
    }

    // === ÉTAPE 6 : Création boîtes mail ===
    log('Étape 6 — Création boîtes mail...');
    let mailResults = [];
    // Attendre un peu que le service email soit provisionné
    await sleep(15000);
    try {
      mailResults = await createMailAccounts(ovh, domain, mailAccounts, nomCabinet);
      log(`${mailResults.length} boîte(s) mail créée(s)`);
    } catch (e) {
      log('Erreur mail: ' + e.message + ' (les mails seront créés plus tard)');
    }

    // === ÉTAPE 7 : Marquer comme actif ===
    const url = `https://${domain}`;
    await updateStatus('active', {
      url,
      deployed_at: new Date().toISOString()
    });

    // Mettre à jour le site
    await supabase.from('sites_jadomi').update({
      domaine_personnel: domain,
      heberge_sur: 'ovh',
      url_jadomi: url,
      statut: 'en_ligne',
      mis_en_ligne_le: new Date().toISOString()
    }).eq('id', siteId);

    log('TERMINÉ — Site live sur ' + url);

    // === ÉTAPE 8 : Email de bienvenue ===
    if (userEmail) {
      try {
        await sendWelcomeEmail(supabase, userEmail, domain, nomCabinet, mailResults);
        log('Email de bienvenue envoyé à ' + userEmail);
      } catch (e) {
        log('Erreur envoi email bienvenue: ' + e.message);
      }
    }

  } catch (err) {
    console.error(`[Orchestrator] [${domain}] ERREUR PIPELINE:`, err.message);
    await updateStatus('error');
  }
}

// === HELPERS ===

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const crypto = require('crypto');
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 14; i++) pw += chars[crypto.randomInt(chars.length)];
  return pw;
}

async function createMailAccounts(ovh, domain, accountNames, displayName) {
  const results = [];
  for (const name of accountNames) {
    try {
      const password = generatePassword();
      await ovh.requestPromised('POST', `/email/domain/${domain}/account`, {
        accountName: name,
        password,
        description: `${displayName} - ${name}`,
        size: 5000000000
      });
      results.push({ email: `${name}@${domain}`, password, ok: true });
    } catch (e) {
      results.push({ email: `${name}@${domain}`, error: e.message, ok: false });
    }
  }
  return results;
}

function runNginxSetup(domain, slug) {
  return new Promise((resolve, reject) => {
    execFile('sudo', ['bash', SETUP_SCRIPT, domain, slug], {
      timeout: 120000
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function sendWelcomeEmail(supabase, toEmail, domain, nomCabinet, mailResults) {
  // Utiliser le service email JADOMI existant
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const mailAccountsHtml = mailResults
    .filter(m => m.ok)
    .map(m => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #eee;font-family:monospace">${m.email}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #eee;font-family:monospace">${m.password}</td>
      </tr>
    `).join('');

  const html = `
    <div style="font-family:'Inter',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px">Votre site est en ligne</h1>
        <p style="color:#8a7239;margin:8px 0 0;font-size:14px">JADOMI</p>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #eee;border-top:none">
        <p>Bonjour,</p>
        <p>Nous avons le plaisir de vous confirmer que votre site <strong>${nomCabinet}</strong> est désormais accessible à l'adresse :</p>
        <p style="text-align:center;margin:24px 0">
          <a href="https://${domain}" style="background:#2D3A8C;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
            https://${domain}
          </a>
        </p>

        ${mailAccountsHtml ? `
        <h2 style="font-size:18px;margin-top:32px;border-bottom:2px solid #f0f0f0;padding-bottom:8px">Vos adresses email professionnelles</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f8f8">
            <th style="padding:8px 16px;text-align:left;font-size:13px">Adresse</th>
            <th style="padding:8px 16px;text-align:left;font-size:13px">Mot de passe</th>
          </tr>
          ${mailAccountsHtml}
        </table>
        <p style="font-size:13px;color:#666">
          Accédez à vos emails via <a href="https://webmail.mail.ovh.net">webmail.mail.ovh.net</a>
          ou configurez-les sur votre téléphone/Outlook (IMAP : ssl0.ovh.net:993, SMTP : ssl0.ovh.net:465).
        </p>
        <p style="font-size:13px;color:#c0392b;font-weight:600">
          Conservez précieusement ces identifiants. Nous vous recommandons de changer vos mots de passe après la première connexion.
        </p>
        ` : ''}

        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:13px;color:#999">
          Si vous avez la moindre question, contactez-nous à
          <a href="mailto:contact@jadomi.fr">contact@jadomi.fr</a>.
        </p>
      </div>
      <div style="background:#f8f8f8;padding:16px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
        <p style="margin:0;font-size:12px;color:#999">JADOMI — Plateforme pour professionnels de santé</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"JADOMI" <${process.env.EMAIL_FROM || 'noreply@jadomi.fr'}>`,
    to: toEmail,
    subject: `Votre site ${domain} est en ligne — JADOMI`,
    html
  });
}
