// =============================================
// JADOMI — Adaptateur CSV Générique
// Fonctionne avec TOUS les logiciels via export CSV
// =============================================
const { ConnectorAdapter } = require('../framework');

class CsvAdapter extends ConnectorAdapter {
  constructor(config) {
    super(config || {});
    this.name = 'csv_import';
  }

  // Pas de connexion nécessaire pour le CSV
  async connect() {
    console.log('[csv] Adaptateur CSV prêt');
  }

  async disconnect() {
    console.log('[csv] Adaptateur CSV déconnecté');
  }

  async testConnection() {
    return { ok: true, message: 'Adaptateur CSV ne nécessite pas de connexion' };
  }

  // Pas de schéma à découvrir pour le CSV
  async discoverSchema() {
    return [];
  }

  // Parse un CSV patients
  async importPatientsCsv(csvContent, delimiter = ';') {
    try {
      const lines = csvContent.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        throw new Error('Le fichier CSV doit contenir au moins un en-tête et une ligne de données');
      }

      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      console.log('[csv] En-têtes détectés:', headers.join(', '));

      const patients = [];

      for (let i = 1; i < lines.length; i++) {
        const values = CsvAdapter.parseCsvLine(lines[i], delimiter);
        if (values.length < 2) continue;

        const row = {};
        headers.forEach((h, idx) => {
          row[h] = (values[idx] || '').trim();
        });

        // Auto-détection colonnes
        patients.push({
          nom: row.nom || row.name || row.patient_nom || row.last_name || row.lastname || '',
          prenom: row.prenom || row.firstname || row.patient_prenom || row.first_name || row.prénom || '',
          date_naissance: row.date_naissance || row.ddn || row.birthdate || row.naissance || row.date_de_naissance || null,
          sexe: row.sexe || row.genre || row.gender || row.sex || null,
          telephone: row.telephone || row.tel || row.phone || row.mobile || row.téléphone || row.portable || '',
          email: row.email || row.mail || row.courriel || row.e_mail || '',
          medecin_traitant: row.medecin_traitant || row.medecin || row.médecin_traitant || row.médecin || '',
          source: 'csv_import',
          synced_at: new Date().toISOString()
        });
      }

      const valid = patients.filter(p => p.nom && p.prenom);
      console.log('[csv]', valid.length, 'patients valides sur', patients.length, 'lignes parsées');
      return valid;
    } catch (err) {
      console.error('[csv] Erreur parsing CSV:', err.message);
      throw err;
    }
  }

  // Parse un CSV rendez-vous
  async importAppointmentsCsv(csvContent, delimiter = ';') {
    try {
      const lines = csvContent.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        throw new Error('Le fichier CSV doit contenir au moins un en-tête et une ligne de données');
      }

      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      const appointments = [];

      for (let i = 1; i < lines.length; i++) {
        const values = CsvAdapter.parseCsvLine(lines[i], delimiter);
        if (values.length < 2) continue;

        const row = {};
        headers.forEach((h, idx) => {
          row[h] = (values[idx] || '').trim();
        });

        appointments.push({
          patient_nom: row.patient_nom || row.patient || row.nom_patient || '',
          patient_prenom: row.patient_prenom || row.prenom_patient || '',
          date_heure: row.date_heure || row.date || row.datetime || row.rdv_date || '',
          duree_minutes: parseInt(row.duree || row.duree_minutes || row.duration || '30', 10),
          motif: row.motif || row.objet || row.raison || row.reason || '',
          praticien_nom: row.praticien || row.praticien_nom || row.dentiste || row.doctor || '',
          statut: row.statut || row.status || 'prévu',
          source: 'csv_import',
          synced_at: new Date().toISOString()
        });
      }

      const valid = appointments.filter(a => a.date_heure);
      console.log('[csv]', valid.length, 'RDV valides sur', appointments.length, 'lignes parsées');
      return valid;
    } catch (err) {
      console.error('[csv] Erreur parsing CSV RDV:', err.message);
      throw err;
    }
  }

  // Parse une ligne CSV en gérant les guillemets
  static parseCsvLine(line, delimiter = ';') {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current);
    return result;
  }
}

module.exports = CsvAdapter;
