// =============================================
// JADOMI — Module Mon site internet
// domains.js — Suggestion noms de domaine
// =============================================
const dns = require('dns');
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');

// OVH API client — graceful fallback si cles manquantes
let ovhClient = null;
try {
  if (process.env.OVH_APPLICATION_KEY && process.env.OVH_APPLICATION_SECRET && process.env.OVH_CONSUMER_KEY) {
    const ovh = require('@ovhcloud/node-ovh');
    ovhClient = ovh({
      endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
      appKey: process.env.OVH_APPLICATION_KEY,
      appSecret: process.env.OVH_APPLICATION_SECRET,
      consumerKey: process.env.OVH_CONSUMER_KEY
    });
    console.log('[JADOMI] Module OVH Domains configure');
  } else {
    console.warn('[JADOMI] Module OVH Domains en mode degrade (cles API manquantes)');
  }
} catch(err) {
  console.error('[JADOMI] OVH init error:', err.message);
}

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
  // POST /domains/suggest — Suggerer des noms de domaine
  // ------------------------------------------
  router.post('/domains/suggest', requireSociete(), async (req, res) => {
    try {
      const { siteId } = req.body;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('*, vitrines_conversations(extracted_data)')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data: societe } = await admin()
        .from('societes')
        .select('nom, ville, adresse_ville')
        .eq('id', req.societe.id)
        .single();

      const profConfig = getProfession(site.profession_id);
      const nom = societe.nom || '';
      const ville = societe.ville || societe.adresse_ville || '';
      const metier = profConfig ? profConfig.id : '';

      // Generer des suggestions
      const suggestions = generateDomainSuggestions(nom, ville, metier);

      // Verifier disponibilite via DNS lookup
      const results = await Promise.all(suggestions.map(async (domain) => {
        const available = await checkDomainAvailability(domain);
        return { domain: domain, available: available };
      }));

      res.json({ success: true, suggestions: results });
    } catch (err) {
      console.error('[vitrines/domains]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /domains/check — Verifier un domaine specifique
  // ------------------------------------------
  router.post('/domains/check', requireSociete(), async (req, res) => {
    try {
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ error: 'domain requis' });

      const available = await checkDomainAvailability(domain);
      res.json({ success: true, domain: domain, available: available });
    } catch (err) {
      console.error('[vitrines/domains]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /domains/set — Definir le domaine personnalise
  // ------------------------------------------
  router.patch('/domains/set', requireSociete(), async (req, res) => {
    try {
      const { siteId, domain } = req.body;
      if (!siteId || !domain) return res.status(400).json({ error: 'siteId et domain requis' });

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data, error } = await admin()
        .from('vitrines_sites')
        .update({ custom_domain: domain })
        .eq('id', siteId)
        .select('*')
        .single();
      if (error) throw error;

      res.json({ success: true, site: data });
    } catch (err) {
      console.error('[vitrines/domains]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /domains/ovh/check — Verification temps reel via OVH API
  // ------------------------------------------
  router.get('/domains/ovh/check', async (req, res) => {
    try {
      const { name } = req.query;
      if (!name) return res.status(400).json({ error: 'Parametre name requis' });

      if (!ovhClient) {
        return res.json({
          domain: name,
          available: null,
          mode: 'degraded',
          message: 'Verification OVH indisponible'
        });
      }

      // Creer un panier OVH temporaire
      const cart = await ovhClient.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR',
        description: 'JADOMI domain check'
      });

      // Verifier disponibilite du domaine
      const results = await ovhClient.requestPromised('GET',
        `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(name)}`
      );

      let available = false;
      let priceEur = null;

      if (results && results.length > 0) {
        const offer = results[0];
        available = offer.action === 'create';
        if (offer.prices && offer.prices.length > 0) {
          const priceObj = offer.prices.find(p => p.label === 'TOTAL') || offer.prices[0];
          priceEur = priceObj ? priceObj.price.value : null;
        }
      }

      // Nettoyage du panier
      try {
        await ovhClient.requestPromised('DELETE', `/order/cart/${cart.cartId}`);
      } catch(_) { /* panier temporaire, on ignore l'erreur */ }

      res.json({
        domain: name,
        available: available,
        price_eur: priceEur,
        mode: 'live'
      });
    } catch (err) {
      console.error('[vitrines/domains/ovh/check]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /domains/ovh/suggest — Suggestions multi-extensions via OVH
  // ------------------------------------------
  router.get('/domains/ovh/suggest', async (req, res) => {
    try {
      const { base } = req.query;
      if (!base) return res.status(400).json({ error: 'Parametre base requis' });

      const extensions = ['.fr', '.com', '.avocat', '.legal', '.eu', '.net', '.paris', '.pro'];
      const normalized = normalizeForDomain(base);

      if (!ovhClient) {
        // Mode degrade : retourner les suggestions sans verification OVH
        const suggestions = extensions.map(ext => ({
          domain: normalized + ext,
          available: null,
          price_eur: null,
          mode: 'degraded'
        }));
        return res.json({
          success: true,
          mode: 'degraded',
          message: 'Verification OVH indisponible, suggestions indicatives',
          suggestions: suggestions
        });
      }

      // Creer un panier OVH temporaire
      const cart = await ovhClient.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR',
        description: 'JADOMI domain suggest'
      });

      // Verifier chaque extension en parallele
      const suggestions = await Promise.all(extensions.map(async (ext) => {
        const domain = normalized + ext;
        try {
          const results = await ovhClient.requestPromised('GET',
            `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(domain)}`
          );

          let available = false;
          let priceEur = null;

          if (results && results.length > 0) {
            const offer = results[0];
            available = offer.action === 'create';
            if (offer.prices && offer.prices.length > 0) {
              const priceObj = offer.prices.find(p => p.label === 'TOTAL') || offer.prices[0];
              priceEur = priceObj ? priceObj.price.value : null;
            }
          }

          return { domain, available, price_eur: priceEur, mode: 'live' };
        } catch(err) {
          return { domain, available: null, price_eur: null, mode: 'error', error: err.message };
        }
      }));

      // Nettoyage du panier
      try {
        await ovhClient.requestPromised('DELETE', `/order/cart/${cart.cartId}`);
      } catch(_) { /* panier temporaire, on ignore l'erreur */ }

      res.json({ success: true, mode: 'live', suggestions: suggestions });
    } catch (err) {
      console.error('[vitrines/domains/ovh/suggest]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /domains/ovh/reserve — Rediriger vers page d'achat OVH
  // ------------------------------------------
  router.post('/domains/ovh/reserve', async (req, res) => {
    try {
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ error: 'domain requis' });

      if (!ovhClient) {
        return res.json({
          success: false,
          mode: 'degraded',
          message: 'Reservation OVH indisponible',
          fallback_url: `https://www.ovh.com/fr/domaines/?q=${encodeURIComponent(domain)}`
        });
      }

      // Creer un panier et ajouter le domaine
      const cart = await ovhClient.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR',
        description: 'JADOMI domain reservation'
      });

      // Assigner le panier a l'utilisateur OVH
      await ovhClient.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);

      // Ajouter le domaine au panier
      await ovhClient.requestPromised('POST', `/order/cart/${cart.cartId}/domain`, {
        domain: domain
      });

      // Generer le bon de commande
      const order = await ovhClient.requestPromised('POST', `/order/cart/${cart.cartId}/checkout`, {
        autoPayWithPreferredPaymentMethod: false,
        waiveRetractationPeriod: false
      });

      res.json({
        success: true,
        mode: 'live',
        domain: domain,
        order_url: order.url || `https://www.ovh.com/cgi-bin/order/displayOrder.cgi?orderId=${order.orderId}`,
        order_id: order.orderId
      });
    } catch (err) {
      console.error('[vitrines/domains/ovh/reserve]', err);
      res.status(500).json({
        success: false,
        error: err.message,
        fallback_url: `https://www.ovh.com/fr/domaines/?q=${encodeURIComponent(req.body.domain || '')}`
      });
    }
  });

};

// ------------------------------------------
// Helpers
// ------------------------------------------

function normalizeForDomain(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 30);
}

function generateDomainSuggestions(nom, ville, metier) {
  const n = normalizeForDomain(nom);
  const v = normalizeForDomain(ville);
  const m = normalizeForDomain(metier);
  const extensions = ['.fr', '.com'];
  const suggestions = [];

  // Pattern 1 : nom simple
  if (n) {
    extensions.forEach(ext => suggestions.push(n + ext));
  }

  // Pattern 2 : nom-ville
  if (n && v) {
    extensions.forEach(ext => suggestions.push(n + '-' + v + ext));
  }

  // Pattern 3 : metier-ville
  if (m && v) {
    suggestions.push(m + '-' + v + '.fr');
  }

  // Pattern 4 : dr-nom (pour sante)
  if (n && ['dentiste', 'medecin', 'kine', 'osteopathe'].includes(metier)) {
    suggestions.push('dr-' + n + '.fr');
  }

  // Pattern 5 : cabinet/labo-nom
  if (n && metier === 'prothesiste') {
    suggestions.push('labo-' + n + '.fr');
  } else if (n) {
    suggestions.push('cabinet-' + n + '.fr');
  }

  // Pattern 6 : avocat/juridique — suggestions specifiques metier
  if (n && (metier.includes('avocat') || metier.includes('juridique'))) {
    suggestions.push('maitre-' + n + '.fr');
    suggestions.push('cabinet-' + n + '.avocat');
    suggestions.push(n + '-avocats.fr');
  }

  return [...new Set(suggestions)].slice(0, 8);
}

function checkDomainAvailability(domain) {
  return new Promise((resolve) => {
    dns.resolve(domain, (err) => {
      // Si erreur DNS (ENOTFOUND), le domaine est probablement disponible
      // Note : ce n'est pas une verification WHOIS complete, juste un indicateur
      resolve(err && err.code === 'ENOTFOUND');
    });
  });
}
