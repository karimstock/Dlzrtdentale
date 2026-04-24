// =============================================
// JADOMI — Moteur d'intervention IA automatique
// Passe 38 — 24 avril 2026
// Execute des modifications sur sites existants via FTP/WordPress
// =============================================
const crypto = require('crypto');
const ftp = require('basic-ftp');
const Anthropic = require('@anthropic-ai/sdk');

// --- Blacklist fichiers sensibles (JAMAIS modifier) ---
const BLACKLIST = [
  'wp-config.php', '.env', '.env.local', '.env.production',
  '.htaccess', 'wp-settings.php', 'xmlrpc.php',
  'checkout.php', 'cart.php', 'payment.php',
  'config.php', 'database.php', 'db.php',
  'wp-login.php', 'wp-cron.php'
];

const BLACKLIST_DIRS = [
  'wp-admin', 'wp-includes', 'node_modules',
  '.git', 'vendor', 'stripe'
];

function isBlacklisted(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const filename = normalized.split('/').pop();
  if (BLACKLIST.includes(filename)) return true;
  for (const dir of BLACKLIST_DIRS) {
    if (normalized.includes('/' + dir + '/')) return true;
  }
  return false;
}

// --- Chiffrement credentials ---
function dechiffrerCredentials(donnees_chiffrees, iv, tag, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  if (tag) decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(donnees_chiffrees, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// --- Connecteur FTP ---
async function connectFTP(creds) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  await client.access({
    host: creds.host,
    port: parseInt(creds.port) || 21,
    user: creds.user,
    password: creds.password,
    secure: false
  });
  return client;
}

async function ftpReadFile(client, remotePath) {
  const { Writable } = require('stream');
  let content = '';
  const writable = new Writable({
    write(chunk, encoding, callback) {
      content += chunk.toString();
      callback();
    }
  });
  await client.downloadTo(writable, remotePath);
  return content;
}

async function ftpWriteFile(client, remotePath, content) {
  const { Readable } = require('stream');
  const readable = Readable.from([content]);
  await client.uploadFrom(readable, remotePath);
}

async function ftpListFiles(client, dir, extensions) {
  const files = [];
  try {
    const list = await client.list(dir);
    for (const item of list) {
      if (item.isDirectory) {
        if (!BLACKLIST_DIRS.includes(item.name.toLowerCase())) {
          const sub = await ftpListFiles(client, dir + '/' + item.name, extensions);
          files.push(...sub);
        }
      } else {
        const ext = item.name.split('.').pop().toLowerCase();
        if (extensions.includes(ext)) {
          files.push(dir + '/' + item.name);
        }
      }
    }
  } catch { /* ignore dir errors */ }
  return files;
}

// --- Connecteur WordPress REST API ---
async function wpReadPages(creds) {
  const baseUrl = (creds.admin_url || '').replace(/\/wp-admin\/?$/, '');
  const auth = 'Basic ' + Buffer.from(creds.admin_user + ':' + creds.admin_password).toString('base64');
  const pages = [];
  let page = 1;
  while (page <= 5) {
    const res = await fetch(baseUrl + '/wp-json/wp/v2/pages?per_page=20&page=' + page, {
      headers: { 'Authorization': auth },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.length) break;
    pages.push(...data);
    page++;
  }
  return pages;
}

async function wpUpdatePage(creds, pageId, content) {
  const baseUrl = (creds.admin_url || '').replace(/\/wp-admin\/?$/, '');
  const auth = 'Basic ' + Buffer.from(creds.admin_user + ':' + creds.admin_password).toString('base64');
  const res = await fetch(baseUrl + '/wp-json/wp/v2/pages/' + pageId, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.rendered || content }),
    signal: AbortSignal.timeout(10000)
  });
  return res.ok;
}

// --- Analyse IA via Claude ---
async function analyserDemande(demande, fichiers, siteInfo) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const fichiersContext = fichiers.map(f =>
    `--- FICHIER: ${f.path} (${f.content.length} chars) ---\n${f.content.substring(0, 3000)}`
  ).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    temperature: 0.1,
    system: `Tu es un developpeur web expert qui modifie un site existant d'un professionnel (dentiste, avocat, etc.).

CONTEXTE DU SITE :
- Plateforme : ${siteInfo.plateforme || 'inconnue'}
- URL : ${siteInfo.url}

TON TRAVAIL :
1. Identifier quels fichiers doivent etre modifies
2. Pour chaque fichier : fournir le remplacement exact (ancien_contenu / nouveau_contenu)
3. Evaluer la complexite (simple/moyen/complexe)
4. Si complexe (refonte, nouvelles pages, e-commerce) : refuser en expliquant pourquoi

REGLES CRITIQUES :
- JAMAIS modifier wp-config.php, .env, .htaccess, fichiers de paiement
- JAMAIS supprimer de contenu sans remplacement
- Faire des remplacements chirurgicaux (le moins de changement possible)
- Preserver l'encodage et l'indentation

FORMAT DE REPONSE : JSON strict uniquement, pas de texte avant ni apres.
{
  "faisable_auto": true|false,
  "raison_si_non": "string ou null",
  "complexite": "simple"|"moyen"|"complexe",
  "nb_fichiers": int,
  "modifications": [
    {
      "fichier": "chemin/relatif/fichier.ext",
      "type_modif": "replace",
      "ancien_contenu": "texte exact a remplacer",
      "nouveau_contenu": "nouveau texte",
      "explication": "pourquoi ce changement"
    }
  ],
  "resume_pour_client": "explication courte en francais",
  "duree_estimee_sec": int
}`,
    messages: [{
      role: 'user',
      content: `DEMANDE DU CLIENT :\n"${demande}"\n\nFICHIERS DU SITE :\n${fichiersContext}`
    }]
  });

  const text = response.content[0]?.text || '';
  // Extraire le JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Reponse IA invalide (pas de JSON)');

  const result = JSON.parse(jsonMatch[0]);
  const tokensIn = response.usage?.input_tokens || 0;
  const tokensOut = response.usage?.output_tokens || 0;
  // Claude Sonnet : ~3$/M input, ~15$/M output
  const coutCentimes = Math.ceil((tokensIn * 0.3 + tokensOut * 1.5) / 1000);

  return { ...result, tokens_input: tokensIn, tokens_output: tokensOut, cout_centimes: coutCentimes };
}

// =============================================
// FONCTION PRINCIPALE : executerIntervention
// =============================================
async function executerIntervention(interventionId, supabase) {
  const startTime = Date.now();
  const CRED_KEY = process.env.SITE_CREDENTIALS_KEY;

  const log = (msg) => console.log(`[intervention ${interventionId.substring(0, 8)}] ${msg}`);

  try {
    // 1. Charger intervention + site + credentials
    log('Etape 1: chargement');
    const { data: intervention, error: intErr } = await supabase
      .from('sites_existants_interventions')
      .select('*')
      .eq('id', interventionId)
      .single();

    if (intErr || !intervention) throw new Error('Intervention non trouvee');

    const { data: site } = await supabase
      .from('sites_existants')
      .select('*')
      .eq('id', intervention.site_id)
      .single();

    if (!site) throw new Error('Site non trouve');

    const { data: credRow } = await supabase
      .from('sites_existants_credentials')
      .select('*')
      .eq('site_id', site.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!credRow) throw new Error('Aucun credential pour ce site');

    const creds = dechiffrerCredentials(credRow.donnees_chiffrees, credRow.iv, credRow.tag, CRED_KEY);

    // Update statut
    await supabase.from('sites_existants_interventions')
      .update({ statut: 'en_cours' }).eq('id', interventionId);

    // 2. Connecter et lister fichiers pertinents
    log('Etape 2: connexion ' + credRow.type_acces);
    let fichiers = [];

    if (credRow.type_acces === 'ftp' || credRow.type_acces === 'sftp') {
      const client = await connectFTP(creds);
      try {
        // Lister fichiers HTML/PHP/CSS pertinents (max 2 niveaux)
        const allFiles = await ftpListFiles(client, '.', ['html', 'php', 'css', 'htm']);
        // Prendre les 8 fichiers les plus probables
        const priorityFiles = allFiles
          .filter(f => !isBlacklisted(f))
          .slice(0, 8);

        for (const fp of priorityFiles) {
          try {
            const content = await ftpReadFile(client, fp);
            if (content.length < 500000) { // max 500KB par fichier
              fichiers.push({ path: fp, content });
            }
          } catch { /* skip unreadable */ }
        }
        // Garder la ref client pour l'upload
        fichiers._ftpClient = client;
      } catch (e) {
        client.close();
        throw new Error('Connexion FTP echouee: ' + e.message);
      }

    } else if (credRow.type_acces === 'wordpress_admin') {
      const pages = await wpReadPages(creds);
      for (const p of pages.slice(0, 10)) {
        fichiers.push({
          path: 'wp-page-' + p.id,
          content: `<!-- Page: ${p.title.rendered} -->\n${p.content.rendered}`,
          wpPageId: p.id,
          wpTitle: p.title.rendered
        });
      }
    }

    if (fichiers.length === 0) throw new Error('Aucun fichier accessible sur le site');

    // 3. Analyse IA
    log('Etape 3: analyse IA (' + fichiers.length + ' fichiers)');
    const analyse = await analyserDemande(
      intervention.demande_libre || intervention.description,
      fichiers,
      site
    );

    // Sauvegarder l'analyse
    await supabase.from('sites_existants_interventions')
      .update({
        analyse_ia: analyse,
        niveau_complexite: analyse.complexite,
        cout_ia_centimes: analyse.cout_centimes
      })
      .eq('id', interventionId);

    // 4. Refus si trop complexe
    if (!analyse.faisable_auto) {
      log('Etape 4: REFUSE - ' + analyse.raison_si_non);
      await supabase.from('sites_existants_interventions')
        .update({
          statut: 'echouee',
          description: (intervention.description || '') + '\n[REFUSE] ' + analyse.raison_si_non,
          duree_ms: Date.now() - startTime
        })
        .eq('id', interventionId);

      if (fichiers._ftpClient) fichiers._ftpClient.close();
      return { success: false, reason: analyse.raison_si_non, resume: analyse.resume_pour_client };
    }

    // 5. Backup des fichiers concernes
    log('Etape 5: backup');
    const fichiersAvant = {};
    for (const modif of analyse.modifications) {
      const fichier = fichiers.find(f => f.path === modif.fichier || f.path.endsWith(modif.fichier));
      if (fichier && !isBlacklisted(fichier.path)) {
        fichiersAvant[fichier.path] = fichier.content;

        const hash = crypto.createHash('sha256').update(fichier.content).digest('hex');
        await supabase.from('sites_existants_backups').insert({
          intervention_id: interventionId,
          site_id: site.id,
          societe_id: site.societe_id,
          chemin_fichier: fichier.path,
          contenu_original: fichier.content,
          taille_octets: Buffer.byteLength(fichier.content),
          hash_sha256: hash
        });
      }
    }

    await supabase.from('sites_existants_interventions')
      .update({ fichiers_avant: fichiersAvant }).eq('id', interventionId);

    // 6. Appliquer les modifications
    log('Etape 6: application (' + analyse.modifications.length + ' modifs)');
    const fichiersApres = {};
    let applied = 0;

    for (const modif of analyse.modifications) {
      if (isBlacklisted(modif.fichier)) {
        log('SKIP blackliste: ' + modif.fichier);
        continue;
      }

      const fichier = fichiers.find(f => f.path === modif.fichier || f.path.endsWith(modif.fichier));
      if (!fichier) continue;

      // Appliquer le remplacement
      let newContent = fichier.content;
      if (modif.ancien_contenu && modif.nouveau_contenu !== undefined) {
        if (!newContent.includes(modif.ancien_contenu)) {
          log('WARN: ancien_contenu non trouve dans ' + modif.fichier);
          continue;
        }
        newContent = newContent.replace(modif.ancien_contenu, modif.nouveau_contenu);
      }

      // Upload
      try {
        if (credRow.type_acces === 'ftp' || credRow.type_acces === 'sftp') {
          await ftpWriteFile(fichiers._ftpClient, fichier.path, newContent);
        } else if (credRow.type_acces === 'wordpress_admin' && fichier.wpPageId) {
          await wpUpdatePage(creds, fichier.wpPageId, newContent);
        }
        fichiersApres[fichier.path] = newContent.substring(0, 1000) + '...';
        applied++;
      } catch (uploadErr) {
        log('ERREUR upload ' + modif.fichier + ': ' + uploadErr.message);
        // Rollback automatique
        log('ROLLBACK automatique');
        await rollbackIntervention(interventionId, supabase, fichiers._ftpClient, creds, credRow.type_acces);
        await supabase.from('sites_existants_interventions')
          .update({
            statut: 'echouee',
            rollback_effectue: true,
            duree_ms: Date.now() - startTime
          })
          .eq('id', interventionId);
        if (fichiers._ftpClient) fichiers._ftpClient.close();
        return { success: false, reason: 'Erreur upload, rollback effectue', rollback: true };
      }
    }

    // Fermer FTP
    if (fichiers._ftpClient) fichiers._ftpClient.close();

    // 7. Verification site en ligne
    log('Etape 7: verification');
    await new Promise(r => setTimeout(r, 3000));
    try {
      const checkRes = await fetch(site.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'JADOMI-Verif/1.0' }
      });
      if (!checkRes.ok) {
        log('WARN: site repond ' + checkRes.status + ' apres modif');
      }
    } catch (e) {
      log('WARN: verification echouee: ' + e.message);
    }

    // 8. Succes
    const dureeMs = Date.now() - startTime;
    log('Etape 8: SUCCES (' + applied + ' fichiers, ' + dureeMs + 'ms)');

    await supabase.from('sites_existants_interventions')
      .update({
        statut: 'terminee',
        exec_automatique: true,
        fichiers_apres: fichiersApres,
        fichiers_modifies: analyse.modifications.map(m => m.fichier),
        duree_ms: dureeMs
      })
      .eq('id', interventionId);

    return {
      success: true,
      fichiers_modifies: applied,
      duree_ms: dureeMs,
      cout_centimes: analyse.cout_centimes,
      resume: analyse.resume_pour_client
    };

  } catch (err) {
    log('ERREUR: ' + err.message);
    await supabase.from('sites_existants_interventions')
      .update({
        statut: 'echouee',
        description: (err.message || 'Erreur inconnue'),
        duree_ms: Date.now() - startTime
      })
      .eq('id', interventionId);
    return { success: false, reason: err.message };
  }
}

// --- Rollback ---
async function rollbackIntervention(interventionId, supabase, ftpClient, creds, typeAcces) {
  const { data: backups } = await supabase
    .from('sites_existants_backups')
    .select('*')
    .eq('intervention_id', interventionId);

  if (!backups || !backups.length) return false;

  for (const backup of backups) {
    try {
      if (typeAcces === 'ftp' || typeAcces === 'sftp') {
        if (ftpClient) {
          await ftpWriteFile(ftpClient, backup.chemin_fichier, backup.contenu_original);
        } else {
          const client = await connectFTP(creds);
          await ftpWriteFile(client, backup.chemin_fichier, backup.contenu_original);
          client.close();
        }
      } else if (typeAcces === 'wordpress_admin') {
        const pageId = backup.chemin_fichier.replace('wp-page-', '');
        await wpUpdatePage(creds, pageId, backup.contenu_original);
      }
    } catch (e) {
      console.error('[rollback] Echec restauration ' + backup.chemin_fichier + ': ' + e.message);
    }
  }

  await supabase.from('sites_existants_interventions')
    .update({ rollback_effectue: true, statut: 'echouee' })
    .eq('id', interventionId);

  return true;
}

module.exports = { executerIntervention, rollbackIntervention, isBlacklisted, dechiffrerCredentials };
