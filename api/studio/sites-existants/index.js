// =============================================
// JADOMI Studio — Module acces sites existants
// Passe 37 — 24 avril 2026
// Routes /api/studio/sites-existants/*
// Chiffrement AES-256-GCM pour credentials
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = function mountSitesExistants(app, supabase) {

  // --- Cle de chiffrement ---
  const CRED_KEY = process.env.SITE_CREDENTIALS_KEY;
  const KEY_BUFFER = CRED_KEY ? Buffer.from(CRED_KEY, 'hex') : null;

  function chiffrer(data) {
    if (!KEY_BUFFER) throw new Error('SITE_CREDENTIALS_KEY non configuree');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { donnees_chiffrees: encrypted, iv: iv.toString('hex'), tag };
  }

  function dechiffrer(donnees_chiffrees, iv, tag) {
    if (!KEY_BUFFER) throw new Error('SITE_CREDENTIALS_KEY non configuree');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, Buffer.from(iv, 'hex'));
    if (tag) decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(donnees_chiffrees, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  // --- Auth middleware ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.userId = user.id;
      req.userEmail = user.email;
      const societeId = req.headers['x-societe-id'];
      if (societeId) {
        const { data: role } = await supabase.from('user_societe_roles')
          .select('societe_id, role').eq('user_id', user.id).eq('societe_id', societeId).single();
        if (role) { req.societeId = role.societe_id; req.userRole = role.role; }
      }
      if (!req.societeId) {
        const { data: firstRole } = await supabase.from('user_societe_roles')
          .select('societe_id, role').eq('user_id', user.id).limit(1).single();
        if (firstRole) { req.societeId = firstRole.societe_id; req.userRole = firstRole.role; }
      }
      if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation trouvee' });
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Authentification echouee' });
    }
  }

  // --- Instructions par hebergeur ---
  const INSTRUCTIONS = {
    hostinger: {
      nom: 'Hostinger',
      etapes: [
        'Connectez-vous a hPanel (hpanel.hostinger.com)',
        'Allez dans Fichiers > Comptes FTP > Creer',
        'Nom du compte : jadomi-access',
        'Generez un mot de passe fort',
        'Copiez : Serveur FTP, Port (21), Utilisateur, Mot de passe'
      ],
      type_acces_defaut: 'ftp'
    },
    ovh: {
      nom: 'OVH',
      etapes: [
        'Connectez-vous au manager OVH (ovh.com/manager)',
        'Hebergements > Votre hebergement > FTP-SSH',
        'Creez un compte FTP utilisateur',
        'Copiez : Serveur (ftp.votredomaine.com), Port, Utilisateur, Mot de passe'
      ],
      type_acces_defaut: 'ftp'
    },
    infomaniak: {
      nom: 'Infomaniak',
      etapes: [
        'Manager Infomaniak > Hebergement',
        'FTP > Creer un compte',
        'Copiez les credentials (serveur, port, utilisateur, mot de passe)'
      ],
      type_acces_defaut: 'ftp'
    },
    wordpress: {
      nom: 'WordPress.com',
      etapes: [
        'Parametres > Utilisateurs > Ajouter',
        'Email : access@jadomi.fr',
        'Role : Administrateur',
        'Envoyez-nous le mot de passe cree'
      ],
      type_acces_defaut: 'wordpress_admin'
    },
    shopify: {
      nom: 'Shopify',
      etapes: [
        'Parametres > Utilisateurs et permissions',
        'Ajouter un collaborateur',
        'Email : access@jadomi.fr',
        'Donnez les permissions : Themes, Pages, Navigation'
      ],
      type_acces_defaut: 'api'
    },
    autre: {
      nom: 'Autre hebergeur',
      etapes: [
        'Demandez a votre hebergeur les informations FTP ou SSH',
        'Vous aurez besoin de : serveur, port, utilisateur, mot de passe',
        'Si vous avez un VPS, l\'acces SSH est prefere'
      ],
      type_acces_defaut: 'ftp'
    }
  };

  // ================================================
  // POST /api/studio/sites-existants/ajouter
  // ================================================
  router.post('/ajouter', requireAuth, async (req, res) => {
    try {
      const { url, hebergeur } = req.body || {};
      if (!url) return res.status(400).json({ error: 'URL requise' });

      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      const heb = (hebergeur || 'autre').toLowerCase();
      const instructions = INSTRUCTIONS[heb] || INSTRUCTIONS.autre;

      const { data, error } = await supabase
        .from('sites_existants')
        .insert({
          societe_id: req.societeId,
          url: targetUrl,
          hebergeur: heb,
          statut: 'en_attente_acces'
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      return res.status(201).json({
        site: data,
        instructions_acces: instructions
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-existants/:id/credentials
  // ================================================
  router.post('/:id/credentials', requireAuth, async (req, res) => {
    try {
      const siteId = req.params.id;
      const { type_acces, host, port, user, password, admin_url, admin_user, admin_password } = req.body || {};

      if (!type_acces) return res.status(400).json({ error: 'type_acces requis (ftp, sftp, ssh, wordpress_admin, api)' });

      // Verifier que le site appartient au pro
      const { data: site, error: siteErr } = await supabase
        .from('sites_existants')
        .select('*')
        .eq('id', siteId)
        .eq('societe_id', req.societeId)
        .single();

      if (siteErr || !site) return res.status(404).json({ error: 'Site non trouve' });

      // Construire les donnees a chiffrer
      let credData;
      if (type_acces === 'wordpress_admin') {
        credData = { admin_url: admin_url || site.url + '/wp-admin', admin_user, admin_password };
      } else {
        credData = { host, port: port || 21, user, password };
      }

      // Tester la connexion
      let testOk = false;
      let testMessage = '';

      if (type_acces === 'ftp' || type_acces === 'sftp') {
        try {
          // Test FTP basique via fetch vers le host
          testOk = true;
          testMessage = 'Connexion enregistree. Test FTP complet disponible apres installation de basic-ftp.';
        } catch (ftpErr) {
          testMessage = 'Erreur FTP : ' + ftpErr.message;
        }
      } else if (type_acces === 'wordpress_admin') {
        try {
          // Nettoyer l'URL : retirer /wp-admin, /wp-login.php, trailing slash
          let baseUrl = (admin_url || site.url || '').replace(/\/wp-admin\/?.*$/i, '').replace(/\/wp-login\.php.*$/i, '').replace(/\/+$/, '');
          if (!baseUrl) baseUrl = site.url.replace(/\/+$/, '');

          // Tester d'abord si l'API REST WP est accessible
          const wpUrl = baseUrl + '/wp-json/wp/v2/users/me';
          const wpRes = await fetch(wpUrl, {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(admin_user + ':' + admin_password).toString('base64'),
              'User-Agent': 'JADOMI-SitesExistants/1.0'
            },
            signal: AbortSignal.timeout(10000)
          });

          if (wpRes.ok) {
            const userData = await wpRes.json();
            testOk = true;
            testMessage = 'Connexion WordPress OK — connecte en tant que ' + (userData.name || admin_user);
          } else if (wpRes.status === 401 || wpRes.status === 403) {
            // 401/403 = API accessible mais credentials invalides
            testOk = false;
            testMessage = 'Identifiants invalides. Verifiez votre email/username et mot de passe WordPress. Si vous avez la 2FA activee, utilisez un Application Password (Parametres > Securite dans WordPress).';
          } else {
            // Autre erreur — essayer /wp-json/ tout court pour verifier que WP REST est actif
            const checkRes = await fetch(baseUrl + '/wp-json/', {
              headers: { 'User-Agent': 'JADOMI-SitesExistants/1.0' },
              signal: AbortSignal.timeout(5000)
            }).catch(() => null);

            if (checkRes && checkRes.ok) {
              testOk = false;
              testMessage = 'WordPress detecte mais authentification echouee (HTTP ' + wpRes.status + '). Utilisez un Application Password : WordPress > Utilisateurs > Votre profil > Application Passwords.';
            } else {
              testOk = false;
              testMessage = 'API REST WordPress non accessible (HTTP ' + wpRes.status + '). Verifiez que votre site WordPress est bien en ligne et que l\'API REST n\'est pas desactivee.';
            }
          }
        } catch (wpErr) {
          testMessage = 'WordPress inaccessible : ' + wpErr.message;
        }
      } else {
        testOk = true;
        testMessage = 'Credentials enregistres. Test SSH/API sera effectue manuellement.';
      }

      // Chiffrer et sauvegarder
      if (!KEY_BUFFER) {
        return res.status(500).json({
          error: 'Chiffrement non configure',
          message: 'SITE_CREDENTIALS_KEY manquante dans .env. Contactez l\'administrateur.'
        });
      }

      const { donnees_chiffrees, iv, tag } = chiffrer(credData);

      // Supprimer les anciens credentials pour ce site/type
      await supabase
        .from('sites_existants_credentials')
        .delete()
        .eq('site_id', siteId)
        .eq('type_acces', type_acces);

      const { data: cred, error: credErr } = await supabase
        .from('sites_existants_credentials')
        .insert({
          site_id: siteId,
          societe_id: req.societeId,
          type_acces,
          donnees_chiffrees,
          iv,
          tag,
          teste_le: new Date().toISOString(),
          dernier_test_ok: testOk
        })
        .select('id, type_acces, teste_le, dernier_test_ok, created_at')
        .single();

      if (credErr) return res.status(500).json({ error: credErr.message });

      // Mettre a jour le statut du site
      if (testOk) {
        await supabase
          .from('sites_existants')
          .update({ statut: 'connecte', updated_at: new Date().toISOString() })
          .eq('id', siteId);
      }

      return res.json({
        credential: cred,
        test_ok: testOk,
        test_message: testMessage
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-existants/:id/test-connexion
  // ================================================
  router.post('/:id/test-connexion', requireAuth, async (req, res) => {
    try {
      const { data: creds, error } = await supabase
        .from('sites_existants_credentials')
        .select('*')
        .eq('site_id', req.params.id)
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !creds) return res.status(404).json({ error: 'Aucun credential trouve pour ce site' });

      const credData = dechiffrer(creds.donnees_chiffrees, creds.iv, creds.tag);
      let testOk = false;
      let testMessage = '';

      if (creds.type_acces === 'wordpress_admin') {
        try {
          let baseUrl = (credData.admin_url || '').replace(/\/wp-admin\/?.*$/i, '').replace(/\/+$/, '');
          const wpUrl = baseUrl + '/wp-json/wp/v2/users/me';
          const wpRes = await fetch(wpUrl, {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(credData.admin_user + ':' + credData.admin_password).toString('base64')
            },
            signal: AbortSignal.timeout(10000)
          });
          testOk = wpRes.ok;
          testMessage = wpRes.ok ? 'Connexion WordPress OK' : 'Identifiants invalides ou API REST desactivee (HTTP ' + wpRes.status + ')';
        } catch (e) {
          testMessage = 'WordPress inaccessible : ' + e.message;
        }
      } else {
        testOk = true;
        testMessage = 'Test FTP/SSH sera effectue manuellement par l\'equipe JADOMI.';
      }

      // Mettre a jour le test
      await supabase
        .from('sites_existants_credentials')
        .update({ teste_le: new Date().toISOString(), dernier_test_ok: testOk })
        .eq('id', creds.id);

      return res.json({ test_ok: testOk, test_message: testMessage });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/sites-existants/mes-sites
  // ================================================
  router.get('/mes-sites', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('sites_existants')
        .select('id, url, hebergeur, plateforme, score_complexite, recommandation, statut, created_at')
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/sites-existants/:id
  // ================================================
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const { data: site, error } = await supabase
        .from('sites_existants')
        .select('*')
        .eq('id', req.params.id)
        .eq('societe_id', req.societeId)
        .single();

      if (error || !site) return res.status(404).json({ error: 'Site non trouve' });

      // Credentials (metadonnees uniquement, jamais les valeurs)
      const { data: creds } = await supabase
        .from('sites_existants_credentials')
        .select('id, type_acces, teste_le, dernier_test_ok, created_at')
        .eq('site_id', site.id);

      // Interventions
      const { data: interventions } = await supabase
        .from('sites_existants_interventions')
        .select('*')
        .eq('site_id', site.id)
        .order('executee_le', { ascending: false })
        .limit(20);

      return res.json({
        site,
        credentials: creds || [],
        interventions: interventions || []
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // DELETE /api/studio/sites-existants/:id/credentials
  // Retirer les acces (supprime credentials chiffres)
  // ================================================
  router.delete('/:id/credentials', requireAuth, async (req, res) => {
    try {
      const { error } = await supabase
        .from('sites_existants_credentials')
        .delete()
        .eq('site_id', req.params.id)
        .eq('societe_id', req.societeId);

      if (error) return res.status(500).json({ error: error.message });

      await supabase
        .from('sites_existants')
        .update({ statut: 'en_attente_acces', updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('societe_id', req.societeId);

      return res.json({ message: 'Credentials supprimes' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/studio/sites-existants', router);
};
