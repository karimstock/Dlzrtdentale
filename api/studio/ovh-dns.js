// =============================================
// JADOMI Studio — Module DNS OVH
// Configuration automatique des zones DNS
// Routes /api/studio/ovh/dns/*
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const { getOvhClient } = require('../../lib/ovh-client');

const VPS_IP = '141.94.10.182';

// Enregistrements MX OVH standard pour Email Pro / MX Plan
const MX_RECORDS = [
  { target: '0 mx0.mail.ovh.net.', ttl: 86400 },
  { target: '10 mx1.mail.ovh.net.', ttl: 86400 },
  { target: '20 mx2.mail.ovh.net.', ttl: 86400 },
  { target: '30 mx3.mail.ovh.net.', ttl: 86400 },
  { target: '40 mx4.mail.ovh.net.', ttl: 86400 }
];

module.exports = function mountOvhDns(app, supabase, requireAuth) {

  // ================================================
  // POST /api/studio/ovh/dns/setup
  // Configurer DNS complet pour un domaine client
  // Body : { domain: "cabinet-dupont.fr", with_mail: true }
  // Crée : A, A www, MX, SPF, SRV autodiscover
  // ================================================
  router.post('/setup', requireAuth, async (req, res) => {
    try {
      const { domain, with_mail } = req.body || {};
      if (!domain) return res.status(400).json({ error: 'domain requis' });

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const zone = domain.trim().toLowerCase();
      const created = [];
      const errors = [];

      // --- Attendre que la zone DNS soit disponible ---
      // Après achat, la zone peut mettre quelques minutes à être créée
      let zoneReady = false;
      for (let i = 0; i < 3; i++) {
        try {
          await ovh.requestPromised('GET', `/domain/zone/${zone}`);
          zoneReady = true;
          break;
        } catch (e) {
          if (i < 2) await new Promise(r => setTimeout(r, 5000));
        }
      }
      if (!zoneReady) {
        return res.status(202).json({
          ok: false,
          message: 'Zone DNS pas encore prête. Réessayez dans quelques minutes.',
          domain: zone,
          retry: true
        });
      }

      // --- 1. Enregistrement A (racine → VPS) ---
      try {
        await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
          fieldType: 'A', subDomain: '', target: VPS_IP, ttl: 3600
        });
        created.push('A @ → ' + VPS_IP);
      } catch (e) {
        errors.push('A @: ' + e.message);
      }

      // --- 2. Enregistrement A (www → VPS) ---
      try {
        await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
          fieldType: 'A', subDomain: 'www', target: VPS_IP, ttl: 3600
        });
        created.push('A www → ' + VPS_IP);
      } catch (e) {
        errors.push('A www: ' + e.message);
      }

      // --- 3. Enregistrements MX pour les mails ---
      if (with_mail !== false) {
        for (const mx of MX_RECORDS) {
          try {
            await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
              fieldType: 'MX', subDomain: '', target: mx.target, ttl: mx.ttl
            });
            created.push('MX → ' + mx.target);
          } catch (e) {
            errors.push('MX: ' + e.message);
          }
        }

        // SPF
        try {
          await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
            fieldType: 'TXT', subDomain: '', target: '"v=spf1 include:mx.ovh.com ~all"', ttl: 3600
          });
          created.push('SPF');
        } catch (e) {
          errors.push('SPF: ' + e.message);
        }

        // SRV autodiscover (pour Outlook/iPhone auto-config)
        try {
          await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
            fieldType: 'SRV', subDomain: '_autodiscover._tcp',
            target: '0 0 443 autodiscover.mail.ovh.net.', ttl: 86400
          });
          created.push('SRV autodiscover');
        } catch (e) {
          errors.push('SRV: ' + e.message);
        }

        // CNAME autoconfig (pour Thunderbird/Android auto-config)
        try {
          await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
            fieldType: 'CNAME', subDomain: 'autoconfig',
            target: 'autodiscover.mail.ovh.net.', ttl: 3600
          });
          created.push('CNAME autoconfig');
        } catch (e) {
          errors.push('CNAME autoconfig: ' + e.message);
        }
      }

      // --- 4. Appliquer les changements DNS ---
      try {
        await ovh.requestPromised('POST', `/domain/zone/${zone}/refresh`);
        created.push('Zone rafraîchie');
      } catch (e) {
        errors.push('Refresh: ' + e.message);
      }

      console.log(`[OVH DNS] Setup ${zone} : ${created.length} OK, ${errors.length} erreurs`);

      return res.json({
        ok: errors.length === 0,
        domain: zone,
        created,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length === 0
          ? `DNS configuré pour ${zone}. Propagation en cours (5-30 min).`
          : `DNS partiellement configuré. ${errors.length} erreur(s).`
      });

    } catch (err) {
      console.error('[OVH DNS] setup error:', err.message);
      return res.status(500).json({ error: 'Erreur configuration DNS' });
    }
  });

  // ================================================
  // GET /api/studio/ovh/dns/records/:domain
  // Lister les enregistrements DNS d'un domaine
  // ================================================
  router.get('/records/:domain', requireAuth, async (req, res) => {
    try {
      const { domain } = req.params;
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const ids = await ovh.requestPromised('GET', `/domain/zone/${domain}/record`);
      const records = await Promise.all(
        ids.map(id => ovh.requestPromised('GET', `/domain/zone/${domain}/record/${id}`))
      );

      return res.json({ domain, records });
    } catch (err) {
      console.error('[OVH DNS] records error:', err.message);
      return res.status(500).json({ error: 'Erreur lecture DNS' });
    }
  });

  app.use('/api/studio/ovh/dns', router);
};
