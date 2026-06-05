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

        // DMARC (anti-spam — les mails sans DMARC tombent en spam chez Gmail)
        try {
          await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
            fieldType: 'TXT', subDomain: '_dmarc',
            target: '"v=DMARC1; p=quarantine; rua=mailto:contact@jadomi.fr; sp=quarantine; adkim=r; aspf=r; pct=100"',
            ttl: 3600
          });
          created.push('DMARC');
        } catch (e) {
          errors.push('DMARC: ' + e.message);
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

  // ================================================
  // POST /api/studio/ovh/dns/setup-dkim
  // Activer DKIM sur un domaine client
  // Le DKIM signe cryptographiquement chaque mail sortant
  // → les serveurs destinataires vérifient que le mail vient bien du domaine
  // Body : { domain }
  // ================================================
  router.post('/setup-dkim', requireAuth, async (req, res) => {
    try {
      const { domain } = req.body || {};
      if (!domain) return res.status(400).json({ error: 'domain requis' });

      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const zone = domain.trim().toLowerCase();
      const results = { created: [], errors: [] };

      // OVH Email MX Plan gère le DKIM automatiquement via l'API /email/domain
      // On doit activer le DKIM sur le service email du domaine
      try {
        // Vérifier si le service email existe
        await ovh.requestPromised('GET', `/email/domain/${zone}`);

        // Lister les DKIM existants
        const existingDkim = await ovh.requestPromised('GET', `/email/domain/${zone}/dkim`).catch(() => []);

        if (existingDkim.length > 0) {
          results.created.push('DKIM déjà actif (' + existingDkim.length + ' clés)');
        } else {
          // Activer DKIM via l'API OVH
          try {
            await ovh.requestPromised('POST', `/email/domain/${zone}/dkim`, {
              autoconfig: true,
              autoEnableDKIM: true
            });
            results.created.push('DKIM activé (autoconfig)');
          } catch (e) {
            // Si l'API DKIM n'est pas dispo, on ajoute manuellement les CNAME
            // OVH utilise des CNAME qui pointent vers leurs serveurs DKIM
            const selectors = ['selector1', 'selector2'];
            for (const sel of selectors) {
              try {
                await ovh.requestPromised('POST', `/domain/zone/${zone}/record`, {
                  fieldType: 'CNAME',
                  subDomain: `${sel}._domainkey`,
                  target: `${sel}._domainkey.${zone}.dkim.mail.ovh.net.`,
                  ttl: 3600
                });
                results.created.push(`DKIM CNAME ${sel}`);
              } catch (e2) {
                results.errors.push(`DKIM ${sel}: ${e2.message}`);
              }
            }
          }
        }
      } catch (e) {
        results.errors.push('Service email non trouvé pour ' + zone + ': ' + e.message);
      }

      // Rafraîchir la zone
      try {
        await ovh.requestPromised('POST', `/domain/zone/${zone}/refresh`);
      } catch (_) {}

      console.log(`[OVH DNS] DKIM ${zone} : ${results.created.length} OK, ${results.errors.length} erreurs`);

      return res.json({
        ok: results.errors.length === 0,
        domain: zone,
        ...results,
        message: results.errors.length === 0
          ? `DKIM activé pour ${zone}. Les mails ne tomberont plus en spam.`
          : `DKIM partiellement configuré.`
      });

    } catch (err) {
      console.error('[OVH DNS] setup-dkim error:', err.message);
      return res.status(500).json({ error: 'Erreur activation DKIM' });
    }
  });

  // ================================================
  // GET /api/studio/ovh/dns/audit/:domain
  // Audit anti-spam complet d'un domaine (SPF + DKIM + DMARC)
  // ================================================
  router.get('/audit/:domain', requireAuth, async (req, res) => {
    try {
      const { domain } = req.params;
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const ids = await ovh.requestPromised('GET', `/domain/zone/${domain}/record`);
      const records = await Promise.all(
        ids.map(id => ovh.requestPromised('GET', `/domain/zone/${domain}/record/${id}`))
      );

      const spf = records.filter(r => r.fieldType === 'SPF' || (r.fieldType === 'TXT' && (r.target || '').includes('spf')));
      const dkim = records.filter(r => (r.subDomain || '').includes('_domainkey'));
      const dmarc = records.filter(r => r.subDomain === '_dmarc');
      const mx = records.filter(r => r.fieldType === 'MX');

      const score = (spf.length > 0 ? 25 : 0) + (dkim.length > 0 ? 25 : 0) + (dmarc.length > 0 ? 25 : 0) + (mx.length > 0 ? 25 : 0);

      return res.json({
        domain,
        score,
        score_label: score === 100 ? 'Excellent' : score >= 75 ? 'Bon' : score >= 50 ? 'Moyen' : 'Mauvais',
        spf: { ok: spf.length > 0, count: spf.length, records: spf },
        dkim: { ok: dkim.length > 0, count: dkim.length, records: dkim },
        dmarc: { ok: dmarc.length > 0, count: dmarc.length, records: dmarc },
        mx: { ok: mx.length > 0, count: mx.length, records: mx },
        missing: [
          ...(spf.length === 0 ? ['SPF'] : []),
          ...(dkim.length === 0 ? ['DKIM'] : []),
          ...(dmarc.length === 0 ? ['DMARC'] : []),
          ...(mx.length === 0 ? ['MX'] : [])
        ]
      });

    } catch (err) {
      console.error('[OVH DNS] audit error:', err.message);
      return res.status(500).json({ error: 'Erreur audit DNS' });
    }
  });

  app.use('/api/studio/ovh/dns', router);
};
