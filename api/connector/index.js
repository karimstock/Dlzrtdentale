// =============================================
// JADOMI — API Connecteur Logiciel Dentaire
// Gestion des connecteurs depuis le dashboard admin
// Auth admin obligatoire (karim_bahmed@yahoo.fr)
// =============================================
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { SyncEngine } = require('../../lib/connector/framework');
const LogosAdapter = require('../../lib/connector/adapters/logos');
const CsvAdapter = require('../../lib/connector/adapters/generic-csv');
const DoctolibAdapter = require('../../lib/connector/adapters/doctolib');

const router = express.Router();

// ===== Supabase Admin (lazy singleton) =====
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

// ===== Auth middleware (Supabase JWT) =====
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karim_bahmed@yahoo.fr';

function requireAdmin() {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Token manquant' });

      const { data, error } = await admin().auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: 'Token invalide' });

      if (data.user.email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }

      req.user = data.user;
      next();
    } catch (err) {
      console.error('[connector] Erreur auth:', err.message);
      res.status(401).json({ error: 'Erreur authentification' });
    }
  };
}

// ===== Multer pour import CSV (5MB max) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(csv|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Veuillez utiliser un fichier CSV.'));
    }
  }
});

// ===== État global du connecteur =====
let currentAdapter = null;
let currentEngine = null;

// ===== Helpers =====
function getSocieteId(req) {
  return req.headers['x-societe-id'] || req.body?.societe_id || null;
}

async function loadConfig(societeId) {
  if (!societeId) return null;
  try {
    const { data, error } = await admin()
      .from('connector_config')
      .select('*')
      .eq('societe_id', societeId)
      .maybeSingle();
    if (error) {
      console.error('[connector] Erreur lecture config:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[connector] Erreur loadConfig:', err.message);
    return null;
  }
}

async function saveConfig(societeId, adapterType, config, mapping) {
  try {
    const payload = {
      societe_id: societeId,
      adapter_type: adapterType,
      config: config,
      mapping: mapping,
      updated_at: new Date().toISOString()
    };

    // Upsert : si la config existe déjà pour cette société, on la met à jour
    const { data, error } = await admin()
      .from('connector_config')
      .upsert(payload, { onConflict: 'societe_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[connector] Erreur saveConfig:', err.message);
    throw err;
  }
}

function createAdapter(adapterType, config) {
  switch (adapterType) {
    case 'logos_w':
    case 'julie':
    case 'visiodent':
      return new LogosAdapter(config); // Tous utilisent Firebird
    case 'doctolib':
      return new DoctolibAdapter(config);
    case 'csv_import':
      return new CsvAdapter(config);
    default:
      throw new Error(`Adaptateur inconnu : ${adapterType}`);
  }
}

// ===== JADOMI API bridge (upsert patients/RDV dans Supabase) =====
function createJadomiApi(societeId) {
  return {
    async upsertPatients(patients) {
      try {
        for (const patient of patients) {
          const { error } = await admin()
            .from('patients')
            .upsert({
              societe_id: societeId,
              id_externe: patient.id_externe,
              nom: patient.nom,
              prenom: patient.prenom,
              date_naissance: patient.date_naissance,
              sexe: patient.sexe,
              telephone: patient.telephone,
              email: patient.email,
              medecin_traitant: patient.medecin_traitant,
              source: patient.source,
              synced_at: patient.synced_at
            }, { onConflict: 'societe_id,id_externe' });
          if (error) {
            console.error('[connector] Erreur upsert patient:', error.message);
          }
        }
        console.log('[connector]', patients.length, 'patients upsertés');
      } catch (err) {
        console.error('[connector] Erreur upsertPatients:', err.message);
        throw err;
      }
    },

    async upsertAppointments(appointments) {
      try {
        for (const rdv of appointments) {
          const { error } = await admin()
            .from('appointments')
            .upsert({
              societe_id: societeId,
              id_externe: rdv.id_externe,
              patient_id_externe: rdv.patient_id_externe,
              praticien_nom: rdv.praticien_nom,
              date_heure: rdv.date_heure,
              duree_minutes: rdv.duree_minutes,
              motif: rdv.motif,
              statut: rdv.statut,
              source: rdv.source,
              synced_at: rdv.synced_at
            }, { onConflict: 'societe_id,id_externe' });
          if (error) {
            console.error('[connector] Erreur upsert RDV:', error.message);
          }
        }
        console.log('[connector]', appointments.length, 'RDV upsertés');
      } catch (err) {
        console.error('[connector] Erreur upsertAppointments:', err.message);
        throw err;
      }
    }
  };
}

// =============================================
// ENDPOINTS
// =============================================

// Tous les endpoints requirent auth admin
router.use(requireAdmin());

// ----- 1. POST /test — Tester connexion Firebird -----
router.post('/test', async (req, res) => {
  try {
    const { database, host, port, user, password, adapter_type } = req.body;
    if (!database) {
      return res.status(400).json({ error: 'Le champ database est obligatoire' });
    }

    const type = adapter_type || 'logos_w';
    const config = { database, host, port, user, password };
    const adapter = createAdapter(type, config);

    console.log('[connector] Test connexion', type, '—', database);
    const result = await adapter.testConnection();

    res.json(result);
  } catch (err) {
    console.error('[connector] Erreur test:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 2. GET /discover — Découverte schéma -----
router.get('/discover', async (req, res) => {
  try {
    const societeId = getSocieteId(req);
    const config = await loadConfig(societeId);

    if (!config) {
      return res.status(400).json({ error: 'Aucune configuration trouvée. Testez la connexion d\'abord.' });
    }

    const adapter = createAdapter(config.adapter_type, config.config);
    await adapter.connect();

    console.log('[connector] Découverte schéma en cours...');
    const schema = await adapter.discoverSchema();
    let autoDetected = null;

    if (adapter.autoDetectTables) {
      autoDetected = await adapter.autoDetectTables();
    }

    await adapter.disconnect();

    console.log('[connector] Schéma découvert :', schema.length, 'tables');
    res.json({
      tables_count: schema.length,
      schema,
      auto_detected: autoDetected
    });
  } catch (err) {
    console.error('[connector] Erreur discover:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 3. POST /configure — Sauvegarder le mapping tables -----
router.post('/configure', async (req, res) => {
  try {
    const societeId = getSocieteId(req);
    if (!societeId) {
      return res.status(400).json({ error: 'societe_id manquant' });
    }

    const { adapter_type, config, mapping } = req.body;
    if (!adapter_type || !config) {
      return res.status(400).json({ error: 'adapter_type et config sont obligatoires' });
    }

    console.log('[connector] Sauvegarde config pour société', societeId);
    const saved = await saveConfig(societeId, adapter_type, config, mapping || {});

    res.json({ ok: true, config: saved });
  } catch (err) {
    console.error('[connector] Erreur configure:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 4. POST /sync-now — Sync manuelle -----
router.post('/sync-now', async (req, res) => {
  try {
    const societeId = getSocieteId(req);
    const config = await loadConfig(societeId);

    if (!config) {
      return res.status(400).json({ error: 'Aucune configuration trouvée.' });
    }

    const adapter = createAdapter(config.adapter_type, {
      ...config.config,
      tables: config.mapping
    });
    const jadomiApi = createJadomiApi(societeId);
    const engine = new SyncEngine(adapter, jadomiApi);

    console.log('[connector] Sync manuelle lancée pour société', societeId);
    await adapter.connect();
    const result = await engine.syncNow();
    await adapter.disconnect();

    // Mettre à jour last_sync dans la config
    await admin()
      .from('connector_config')
      .update({ last_sync: new Date().toISOString(), status: 'synced' })
      .eq('societe_id', societeId);

    res.json({ ok: true, result, status: engine.getStatus() });
  } catch (err) {
    console.error('[connector] Erreur sync-now:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 5. GET /status — Statut sync -----
router.get('/status', async (req, res) => {
  try {
    const societeId = getSocieteId(req);

    // Statut de l'engine actif
    if (currentEngine && currentAdapter) {
      const status = currentEngine.getStatus();
      res.json(status);
    } else {
      // Lire depuis la config en base
      const config = await loadConfig(societeId);
      res.json({
        running: false,
        lastSync: config?.last_sync || null,
        adapter: config?.adapter_type || null,
        status: config?.status || 'not_configured',
        stats: { patients_synced: 0, appointments_synced: 0, errors: 0 }
      });
    }
  } catch (err) {
    console.error('[connector] Erreur status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 6. POST /start — Démarrer sync temps réel -----
router.post('/start', async (req, res) => {
  try {
    if (currentEngine && currentEngine.isRunning) {
      return res.status(400).json({ error: 'Une sync est déjà en cours. Arrêtez-la d\'abord.' });
    }

    const societeId = getSocieteId(req);
    const config = await loadConfig(societeId);

    if (!config) {
      return res.status(400).json({ error: 'Aucune configuration trouvée.' });
    }

    const intervalMs = req.body.interval_ms || 10000;

    currentAdapter = createAdapter(config.adapter_type, {
      ...config.config,
      tables: config.mapping
    });
    const jadomiApi = createJadomiApi(societeId);
    currentEngine = new SyncEngine(currentAdapter, jadomiApi);

    console.log('[connector] Démarrage sync temps réel — intervalle', intervalMs, 'ms');
    await currentEngine.start(intervalMs);

    await admin()
      .from('connector_config')
      .update({ status: 'running' })
      .eq('societe_id', societeId);

    res.json({ ok: true, status: currentEngine.getStatus() });
  } catch (err) {
    console.error('[connector] Erreur start:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 7. POST /stop — Arrêter sync -----
router.post('/stop', async (req, res) => {
  try {
    if (!currentEngine || !currentEngine.isRunning) {
      return res.status(400).json({ error: 'Aucune sync en cours.' });
    }

    const societeId = getSocieteId(req);

    console.log('[connector] Arrêt sync temps réel');
    await currentEngine.stop();

    const status = currentEngine.getStatus();
    currentEngine = null;
    currentAdapter = null;

    if (societeId) {
      await admin()
        .from('connector_config')
        .update({ status: 'stopped', last_sync: new Date().toISOString() })
        .eq('societe_id', societeId);
    }

    res.json({ ok: true, status });
  } catch (err) {
    console.error('[connector] Erreur stop:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 8. POST /import-csv — Import CSV patients -----
router.post('/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier CSV fourni' });
    }

    const societeId = getSocieteId(req);
    if (!societeId) {
      return res.status(400).json({ error: 'societe_id manquant' });
    }

    const delimiter = req.body.delimiter || ';';
    const type = req.body.type || 'patients'; // 'patients' ou 'appointments'
    const csvContent = req.file.buffer.toString('utf-8');

    console.log('[connector] Import CSV', type, '— taille:', csvContent.length, 'octets');

    const csvAdapter = new CsvAdapter({});
    let imported;

    if (type === 'appointments') {
      imported = await csvAdapter.importAppointmentsCsv(csvContent, delimiter);
    } else {
      imported = await csvAdapter.importPatientsCsv(csvContent, delimiter);
    }

    // Upsert dans Supabase
    const jadomiApi = createJadomiApi(societeId);
    if (type === 'appointments') {
      await jadomiApi.upsertAppointments(imported);
    } else {
      await jadomiApi.upsertPatients(imported);
    }

    console.log('[connector] Import CSV terminé :', imported.length, type);
    res.json({
      ok: true,
      imported: imported.length,
      type,
      preview: imported.slice(0, 5)
    });
  } catch (err) {
    console.error('[connector] Erreur import-csv:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- 9. GET /patients-preview — Preview des 20 premiers patients -----
router.get('/patients-preview', async (req, res) => {
  try {
    const societeId = getSocieteId(req);
    const config = await loadConfig(societeId);

    if (!config) {
      return res.status(400).json({ error: 'Aucune configuration trouvée.' });
    }

    const adapter = createAdapter(config.adapter_type, {
      ...config.config,
      tables: config.mapping
    });

    await adapter.connect();

    console.log('[connector] Preview patients — source:', config.adapter_type);

    // Lire les 20 premiers patients bruts
    let preview;
    if (config.mapping?.patients?.table) {
      const sql = `SELECT FIRST 20 * FROM ${config.mapping.patients.table}`;
      preview = await adapter.query(sql);
    } else {
      // Si pas de mapping, on essaie auto-detect
      const detected = await adapter.autoDetectTables();
      if (detected.patients) {
        const sql = `SELECT FIRST 20 * FROM ${detected.patients.table}`;
        preview = await adapter.query(sql);
      } else {
        await adapter.disconnect();
        return res.status(400).json({ error: 'Table patients non détectée. Lancez /discover d\'abord.' });
      }
    }

    await adapter.disconnect();

    res.json({
      count: preview.length,
      patients: preview
    });
  } catch (err) {
    console.error('[connector] Erreur patients-preview:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
