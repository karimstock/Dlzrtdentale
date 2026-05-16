// =============================================
// JADOMI Connector — Adaptateur Doctolib iCal
// Lit le flux iCal Doctolib pour recuperer les RDV
// Zero API partenaire, juste le lien .ics du praticien
// =============================================
const { ConnectorAdapter } = require('../framework');

class DoctolibIcalAdapter extends ConnectorAdapter {
  constructor(config) {
    super(config);
    this.name = 'doctolib_ical';
    // config.ical_url = le lien .ics de Doctolib
    this.icalUrl = config.ical_url;
    if (!this.icalUrl) throw new Error('ical_url requis (Doctolib > Parametres > Synchronisation calendrier)');
  }

  async connect() {
    console.log('[doctolib-ical] Connecte a', this.icalUrl.substring(0, 50) + '...');
  }

  async disconnect() {
    console.log('[doctolib-ical] Deconnecte');
  }

  async testConnection() {
    try {
      const res = await fetch(this.icalUrl);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) {
        return { ok: false, error: 'Le lien ne contient pas de calendrier iCal valide' };
      }
      const events = this._parseIcal(text);
      return { ok: true, events_count: events.length, message: `${events.length} evenements trouves` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async discoverSchema() {
    return [{ name: 'VCALENDAR', columns: [
      { name: 'SUMMARY', type: 'TEXT' },
      { name: 'DTSTART', type: 'DATETIME' },
      { name: 'DTEND', type: 'DATETIME' },
      { name: 'DESCRIPTION', type: 'TEXT' },
      { name: 'LOCATION', type: 'TEXT' },
      { name: 'UID', type: 'TEXT' }
    ]}];
  }

  async getPatients() {
    const events = await this._fetchEvents();
    const patientsMap = new Map();

    for (const evt of events) {
      const parsed = this._parsePatientFromEvent(evt);
      if (parsed && parsed.nom) {
        const key = `${parsed.nom}_${parsed.prenom}`.toLowerCase();
        if (!patientsMap.has(key)) {
          patientsMap.set(key, parsed);
        }
      }
    }

    return Array.from(patientsMap.values());
  }

  async getAppointments(dateFrom, dateTo) {
    const events = await this._fetchEvents();
    let filtered = events;

    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter(e => e.start >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      filtered = filtered.filter(e => e.start <= to);
    }

    return filtered.map(evt => {
      const patient = this._parsePatientFromEvent(evt);
      return {
        id_externe: evt.uid || '',
        patient_nom: patient?.nom || '',
        patient_prenom: patient?.prenom || '',
        patient_name_full: evt.summary || '',
        date_heure: evt.start?.toISOString() || '',
        date_fin: evt.end?.toISOString() || '',
        duree_minutes: evt.start && evt.end ? Math.round((evt.end - evt.start) / 60000) : 30,
        motif: evt.description || '',
        lieu: evt.location || '',
        source: 'doctolib_ical',
        synced_at: new Date().toISOString()
      };
    });
  }

  async getMedicalHistory() {
    // Doctolib iCal ne contient pas d'antecedents
    return null;
  }

  // ===== Private =====

  async _fetchEvents() {
    const res = await fetch(this.icalUrl);
    if (!res.ok) throw new Error(`Doctolib iCal erreur HTTP ${res.status}`);
    const text = await res.text();
    return this._parseIcal(text);
  }

  _parseIcal(text) {
    const events = [];
    const blocks = text.split('BEGIN:VEVENT');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0];
      const evt = {};

      const lines = block.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('SUMMARY:')) evt.summary = trimmed.substring(8).trim();
        else if (trimmed.startsWith('DTSTART')) evt.start = this._parseIcalDate(trimmed);
        else if (trimmed.startsWith('DTEND')) evt.end = this._parseIcalDate(trimmed);
        else if (trimmed.startsWith('DESCRIPTION:')) evt.description = trimmed.substring(12).trim().replace(/\\n/g, '\n');
        else if (trimmed.startsWith('LOCATION:')) evt.location = trimmed.substring(9).trim();
        else if (trimmed.startsWith('UID:')) evt.uid = trimmed.substring(4).trim();
      }

      if (evt.summary && evt.start) {
        events.push(evt);
      }
    }

    return events;
  }

  _parseIcalDate(line) {
    // DTSTART:20260512T143000Z ou DTSTART;VALUE=DATE:20260512
    const match = line.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
    if (!match) return null;
    const [, y, m, d, h, min, s] = match;
    return new Date(`${y}-${m}-${d}T${h || '00'}:${min || '00'}:${s || '00'}Z`);
  }

  _parsePatientFromEvent(evt) {
    if (!evt.summary) return null;

    // Doctolib summary format: "Prenom Nom" ou "Nom Prenom" ou "Consultation - Prenom Nom"
    let name = evt.summary;

    // Retirer prefixes courants Doctolib
    name = name.replace(/^(Consultation|Rendez-vous|RDV|Urgence|Controle|Detartrage)\s*[-:]\s*/i, '');
    name = name.trim();

    // Split en mots
    const parts = name.split(/\s+/).filter(p => p.length > 0);
    if (parts.length < 2) return { nom: name, prenom: '' };

    // Heuristique : si le premier mot est en MAJUSCULES c'est le nom
    if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
      return { nom: parts[0], prenom: parts.slice(1).join(' ') };
    }

    // Sinon : premier = prenom, dernier = nom (convention Doctolib)
    return {
      prenom: parts.slice(0, -1).join(' '),
      nom: parts[parts.length - 1]
    };
  }
}

module.exports = LogosAdapter = DoctolibIcalAdapter;
module.exports = DoctolibIcalAdapter;
