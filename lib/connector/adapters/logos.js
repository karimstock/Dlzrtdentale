// =============================================
// JADOMI — Adaptateur Logos_w (Firebird)
// Connecteur pour le logiciel de gestion dentaire Logos_w
// Base Firebird locale (.fdb) sur le serveur du cabinet
// =============================================
const Firebird = require('node-firebird');
const { ConnectorAdapter } = require('../framework');

class LogosAdapter extends ConnectorAdapter {
  constructor(config) {
    super(config);
    this.name = 'logos_w';
    this.db = null;
    // Config attendue : { database: 'C:\\Logos_w\\Data\\logos.fdb', host: '127.0.0.1', port: 3050, user: 'SYSDBA', password: 'masterkey' }
    // Note : Firebird default user/password est souvent SYSDBA/masterkey
    this.fbOptions = {
      host: config.host || '127.0.0.1',
      port: config.port || 3050,
      database: config.database, // chemin du .fdb
      user: config.user || 'SYSDBA',
      password: config.password || 'masterkey',
      lowercase_keys: true,
      role: null,
      pageSize: 4096
    };
    // Mapping tables (sera configuré après discovery)
    this.tables = config.tables || {
      patients: null,        // sera découvert
      appointments: null,    // sera découvert
      practitioners: null,   // sera découvert
      medical_history: null  // sera découvert
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      Firebird.attach(this.fbOptions, (err, db) => {
        if (err) return reject(err);
        this.db = db;
        console.log('[logos] Connecté à', this.fbOptions.database);
        resolve();
      });
    });
  }

  async disconnect() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.detach(() => {
          this.db = null;
          console.log('[logos] Déconnecté');
          resolve();
        });
      });
    }
  }

  async testConnection() {
    try {
      await this.connect();
      const tables = await this.discoverSchema();
      await this.disconnect();
      return { ok: true, tables_count: tables.length, tables: tables.map(t => t.name) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // DISCOVERY MODE — trouver toutes les tables et colonnes
  async discoverSchema() {
    const tables = await this.query(`
      SELECT RDB$RELATION_NAME as name
      FROM RDB$RELATIONS
      WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLF IS NULL
      ORDER BY RDB$RELATION_NAME
    `);

    const schema = [];
    for (const table of tables) {
      const tableName = (table.name || '').trim();
      if (!tableName) continue;

      try {
        const columns = await this.query(`
          SELECT rf.RDB$FIELD_NAME as name,
                 f.RDB$FIELD_TYPE as type,
                 f.RDB$FIELD_LENGTH as length,
                 rf.RDB$NULL_FLAG as not_null
          FROM RDB$RELATION_FIELDS rf
          JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
          WHERE rf.RDB$RELATION_NAME = '${tableName}'
          ORDER BY rf.RDB$FIELD_POSITION
        `);

        schema.push({
          name: tableName,
          columns: columns.map(c => ({
            name: (c.name || '').trim(),
            type: c.type,
            length: c.length,
            not_null: !!c.not_null
          }))
        });
      } catch (err) {
        console.error('[logos] Erreur lecture colonnes pour', tableName, ':', err.message);
      }
    }
    return schema;
  }

  // Chercher les tables qui RESSEMBLENT à des patients/rdv
  async autoDetectTables() {
    const schema = await this.discoverSchema();
    const detected = { patients: null, appointments: null, practitioners: null };

    for (const table of schema) {
      const name = table.name.toLowerCase();
      const cols = table.columns.map(c => (c.name || '').toLowerCase());

      // Détection patients : table avec nom + prénom + date_naissance
      if (cols.some(c => c.includes('nom')) && cols.some(c => c.includes('prenom'))) {
        if (cols.some(c => c.includes('nais') || c.includes('birth') || c.includes('ddn'))) {
          detected.patients = { table: table.name, columns: table.columns };
        }
      }

      // Détection RDV : table avec date + heure + patient
      if (cols.some(c => c.includes('date') || c.includes('jour')) &&
          cols.some(c => c.includes('heure') || c.includes('debut') || c.includes('time'))) {
        detected.appointments = { table: table.name, columns: table.columns };
      }

      // Détection praticiens
      if (name.includes('prat') || name.includes('medecin') || name.includes('doctor')) {
        detected.practitioners = { table: table.name, columns: table.columns };
      }
    }

    return detected;
  }

  // Helper query
  async query(sql) {
    if (!this.db) await this.connect();
    return new Promise((resolve, reject) => {
      this.db.query(sql, [], (err, result) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });
  }

  // Lire patients — utilise le mapping configuré
  async getPatients(since) {
    if (!this.tables.patients) {
      throw new Error('Table patients non configurée. Lancez discoverSchema() d\'abord.');
    }
    const mapping = this.tables.patients;
    let sql = `SELECT * FROM ${mapping.table}`;
    if (since && mapping.columns.modified) {
      sql += ` WHERE ${mapping.columns.modified} > '${since}'`;
    }
    const rows = await this.query(sql);
    return rows.map(row => this.mapPatient(row, mapping));
  }

  // Mapper une ligne Logos vers format JADOMI standard
  mapPatient(row, mapping) {
    const m = mapping.columns;
    return {
      id_externe: String(row[m.id] || ''),
      nom: (row[m.nom] || '').toString().trim(),
      prenom: (row[m.prenom] || '').toString().trim(),
      date_naissance: row[m.date_naissance] || null,
      sexe: row[m.sexe] || null,
      telephone: (row[m.telephone] || '').toString().trim(),
      email: (row[m.email] || '').toString().trim(),
      medecin_traitant: m.medecin_traitant ? (row[m.medecin_traitant] || '').toString().trim() : '',
      source: 'logos_w',
      synced_at: new Date().toISOString(),
      raw: row // garder les données brutes pour debug
    };
  }

  // Lire RDV
  async getAppointments(dateFrom, dateTo) {
    if (!this.tables.appointments) {
      throw new Error('Table RDV non configurée.');
    }
    const mapping = this.tables.appointments;
    let sql = `SELECT * FROM ${mapping.table}`;
    const conditions = [];
    if (dateFrom && mapping.columns.date) {
      conditions.push(`${mapping.columns.date} >= '${dateFrom}'`);
    }
    if (dateTo && mapping.columns.date) {
      conditions.push(`${mapping.columns.date} <= '${dateTo}'`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    if (mapping.columns.date) {
      sql += ` ORDER BY ${mapping.columns.date}`;
    }
    return this.query(sql);
  }

  // Lire les antécédents/questionnaire médical
  async getMedicalHistory(patientId) {
    if (!this.tables.medical_history) {
      throw new Error('Table antécédents non configurée.');
    }
    const mapping = this.tables.medical_history;
    const sql = `SELECT * FROM ${mapping.table} WHERE ${mapping.columns.patient_id} = '${patientId}'`;
    return this.query(sql);
  }
}

module.exports = LogosAdapter;
