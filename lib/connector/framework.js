// =============================================
// JADOMI — Framework Connecteur Logiciel Dentaire
// Classe abstraite ConnectorAdapter + SyncEngine
// =============================================

// ===== ConnectorAdapter — interface que chaque adaptateur implémente =====
class ConnectorAdapter {
  constructor(config) {
    this.config = config;
    this.name = 'unknown';
  }

  // Connecter à la source
  async connect() { throw new Error('connect() non implémenté'); }

  // Déconnecter
  async disconnect() { throw new Error('disconnect() non implémenté'); }

  // Tester la connexion
  async testConnection() { throw new Error('testConnection() non implémenté'); }

  // Lire les patients (retourne format JADOMI standard)
  async getPatients(since) { throw new Error('getPatients() non implémenté'); }

  // Lire les RDV (retourne format JADOMI standard)
  async getAppointments(dateFrom, dateTo) { throw new Error('getAppointments() non implémenté'); }

  // Lire les antécédents/questionnaire médical
  async getMedicalHistory(patientId) { throw new Error('getMedicalHistory() non implémenté'); }

  // Découvrir le schéma (pour reverse-engineering)
  async discoverSchema() { throw new Error('discoverSchema() non implémenté'); }
}

// Format patient standard JADOMI :
// { id_externe, nom, prenom, date_naissance, sexe, telephone, email,
//   medecin_traitant, allergies, medicaments, antecedents,
//   source: 'logos_w', synced_at }

// Format RDV standard JADOMI :
// { id_externe, patient_id_externe, praticien_nom, date_heure,
//   duree_minutes, motif, statut, source: 'logos_w', synced_at }

// ===== SyncEngine — moteur de synchronisation =====
class SyncEngine {
  constructor(adapter, jadomiApi) {
    this.adapter = adapter;
    this.jadomiApi = jadomiApi;
    this.lastSync = null;
    this.isRunning = false;
    this.interval = null;
    this.stats = {
      patients_synced: 0,
      appointments_synced: 0,
      errors: 0,
      last_error: null,
      total_syncs: 0
    };
  }

  // Démarrer la sync temps réel (poll toutes les 10 secondes par défaut)
  async start(intervalMs = 10000) {
    if (this.isRunning) {
      console.log('[connector] Sync déjà en cours pour', this.adapter.name);
      return;
    }
    try {
      await this.adapter.connect();
      this.isRunning = true;
      console.log('[connector] Sync démarrée pour', this.adapter.name, '— intervalle', intervalMs, 'ms');

      // Première sync immédiate
      await this.syncNow();

      // Puis poll régulier
      this.interval = setInterval(async () => {
        try {
          await this.syncNow();
        } catch (err) {
          console.error('[connector] Erreur sync périodique:', err.message);
          this.stats.errors++;
          this.stats.last_error = err.message;
        }
      }, intervalMs);
    } catch (err) {
      this.isRunning = false;
      console.error('[connector] Échec démarrage sync:', err.message);
      throw err;
    }
  }

  // Arrêter
  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    try {
      await this.adapter.disconnect();
    } catch (err) {
      console.error('[connector] Erreur déconnexion:', err.message);
    }
    console.log('[connector] Sync arrêtée pour', this.adapter.name);
  }

  // Sync manuelle
  async syncNow() {
    const syncStart = new Date().toISOString();
    console.log('[connector] Sync manuelle lancée —', this.adapter.name, '— since:', this.lastSync || 'début');

    try {
      // 1. Lire patients modifiés depuis lastSync
      let patients = [];
      try {
        patients = await this.adapter.getPatients(this.lastSync);
        console.log('[connector] Patients récupérés:', patients.length);
      } catch (err) {
        if (!err.message.includes('non configurée')) {
          throw err;
        }
        console.log('[connector] Table patients non configurée, skip');
      }

      // 2. Upsert patients dans JADOMI via API
      if (patients.length > 0 && this.jadomiApi?.upsertPatients) {
        await this.jadomiApi.upsertPatients(patients);
        this.stats.patients_synced += patients.length;
      }

      // 3. Lire RDV modifiés
      let appointments = [];
      try {
        const today = new Date().toISOString().split('T')[0];
        const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        appointments = await this.adapter.getAppointments(today, futureDate);
        console.log('[connector] RDV récupérés:', appointments.length);
      } catch (err) {
        if (!err.message.includes('non configurée')) {
          throw err;
        }
        console.log('[connector] Table RDV non configurée, skip');
      }

      // 4. Upsert RDV dans JADOMI
      if (appointments.length > 0 && this.jadomiApi?.upsertAppointments) {
        await this.jadomiApi.upsertAppointments(appointments);
        this.stats.appointments_synced += appointments.length;
      }

      // 5. Mettre à jour lastSync
      this.lastSync = syncStart;
      this.stats.total_syncs++;

      console.log('[connector] Sync terminée —', patients.length, 'patients,', appointments.length, 'RDV');
      return { patients: patients.length, appointments: appointments.length };
    } catch (err) {
      this.stats.errors++;
      this.stats.last_error = err.message;
      console.error('[connector] Erreur syncNow:', err.message);
      throw err;
    }
  }

  // Stats
  getStatus() {
    return {
      running: this.isRunning,
      lastSync: this.lastSync,
      adapter: this.adapter.name,
      stats: { ...this.stats }
    };
  }
}

module.exports = { ConnectorAdapter, SyncEngine };
