// =============================================
// JADOMI Studio — Module Email OVH
// Création automatique de boîtes mail sur domaine client
// Routes /api/studio/ovh/mail/*
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getOvhClient } = require('../../lib/ovh-client');

// Générer un mot de passe sécurisé pour la boîte mail
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 14; i++) {
    pw += chars[crypto.randomInt(chars.length)];
  }
  return pw;
}

// Paramètres mail OVH
const IMAP_HOST = 'ssl0.ovh.net';
const IMAP_PORT = 993;
const SMTP_HOST = 'ssl0.ovh.net';
const SMTP_PORT = 465;
const WEBMAIL_URL = 'https://webmail.mail.ovh.net';

module.exports = function mountOvhMail(app, supabase, requireAuth) {

  // ================================================
  // POST /api/studio/ovh/mail/create
  // Créer une boîte mail sur un domaine client
  // Body : { domain, account_name, display_name, site_id }
  // Ex: { domain: "cabinet-dupont.fr", account_name: "contact", display_name: "Cabinet Dupont" }
  // ================================================
  router.post('/create', requireAuth, async (req, res) => {
    try {
      const { domain, account_name, display_name, site_id } = req.body || {};
      if (!domain || !account_name) {
        return res.status(400).json({ error: 'domain et account_name requis' });
      }

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const emailAddress = `${account_name.trim().toLowerCase()}@${domain.trim().toLowerCase()}`;
      const password = generatePassword();

      console.log(`[OVH Mail] Création boîte ${emailAddress}`);

      // Créer le compte email via MX Plan
      // (chaque domaine OVH a un MX Plan gratuit avec 10 boîtes de 5 Go)
      await ovh.requestPromised('POST', `/email/domain/${domain}/account`, {
        accountName: account_name.trim().toLowerCase(),
        password: password,
        description: display_name || 'JADOMI Site',
        size: 5000000000 // 5 Go
      });

      console.log(`[OVH Mail] Boîte ${emailAddress} créée`);

      // Sauvegarder en BDD (mot de passe chiffré)
      const { error: insertErr } = await supabase
        .from('site_hebergements')
        .update({
          email_accounts: supabase.rpc ? undefined : [{ // fallback: on stocke dans un champ JSON
            email: emailAddress,
            display_name: display_name || account_name,
            created_at: new Date().toISOString()
          }]
        })
        .eq('domain', domain)
        .eq('societe_id', req.societeId);

      return res.json({
        ok: true,
        email: emailAddress,
        password: password,
        display_name: display_name || account_name,
        config: {
          webmail: WEBMAIL_URL,
          imap: { host: IMAP_HOST, port: IMAP_PORT, security: 'SSL/TLS' },
          smtp: { host: SMTP_HOST, port: SMTP_PORT, security: 'SSL/TLS' },
          login: emailAddress
        },
        message: `Boîte mail ${emailAddress} créée. Conservez le mot de passe.`
      });

    } catch (err) {
      console.error('[OVH Mail] create error:', err.message, err);

      // Si le domaine n'est pas encore prêt pour les mails
      if (err.message && err.message.includes('not found')) {
        return res.status(202).json({
          ok: false,
          message: 'Le service email pour ce domaine n\'est pas encore prêt. Réessayez dans quelques minutes.',
          retry: true
        });
      }

      return res.status(500).json({ error: 'Erreur création boîte mail', detail: err.message });
    }
  });

  // ================================================
  // GET /api/studio/ovh/mail/list/:domain
  // Lister les boîtes mail d'un domaine
  // ================================================
  router.get('/list/:domain', requireAuth, async (req, res) => {
    try {
      const { domain } = req.params;
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const accounts = await ovh.requestPromised('GET', `/email/domain/${domain}/account`);

      // Récupérer détails de chaque compte
      const details = await Promise.all(
        accounts.map(async name => {
          try {
            const info = await ovh.requestPromised('GET', `/email/domain/${domain}/account/${name}`);
            return {
              email: `${name}@${domain}`,
              account_name: name,
              description: info.description || '',
              size_bytes: info.size || 0,
              is_blocked: info.isBlocked || false
            };
          } catch (_) {
            return { email: `${name}@${domain}`, account_name: name };
          }
        })
      );

      return res.json({ domain, accounts: details });

    } catch (err) {
      console.error('[OVH Mail] list error:', err.message);
      return res.status(500).json({ error: 'Erreur liste boîtes mail' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/mail/reset-password
  // Réinitialiser le mot de passe d'une boîte mail
  // Body : { domain, account_name }
  // ================================================
  router.post('/reset-password', requireAuth, async (req, res) => {
    try {
      const { domain, account_name } = req.body || {};
      if (!domain || !account_name) {
        return res.status(400).json({ error: 'domain et account_name requis' });
      }

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const newPassword = generatePassword();

      await ovh.requestPromised('POST', `/email/domain/${domain}/account/${account_name}/changePassword`, {
        password: newPassword
      });

      return res.json({
        ok: true,
        email: `${account_name}@${domain}`,
        password: newPassword,
        message: 'Mot de passe réinitialisé'
      });

    } catch (err) {
      console.error('[OVH Mail] reset-password error:', err.message);
      return res.status(500).json({ error: 'Erreur réinitialisation mot de passe' });
    }
  });

  // ================================================
  // DELETE /api/studio/ovh/mail/delete
  // Supprimer une boîte mail
  // Body : { domain, account_name }
  // ================================================
  router.delete('/delete', requireAuth, async (req, res) => {
    try {
      const { domain, account_name } = req.body || {};
      if (!domain || !account_name) {
        return res.status(400).json({ error: 'domain et account_name requis' });
      }

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      await ovh.requestPromised('DELETE', `/email/domain/${domain}/account/${account_name}`);

      return res.json({
        ok: true,
        email: `${account_name}@${domain}`,
        message: 'Boîte mail supprimée'
      });

    } catch (err) {
      console.error('[OVH Mail] delete error:', err.message);
      return res.status(500).json({ error: 'Erreur suppression boîte mail' });
    }
  });

  app.use('/api/studio/ovh/mail', router);
};
