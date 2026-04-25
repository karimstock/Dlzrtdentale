/**
 * JADOMI Triangle - Photo Consent (RGPD)
 * Consent dialog and audit logging for medical photo sharing
 * Namespace: window.JADOMI_PHOTO_CONSENT
 */
(function () {
  'use strict';

  // Inject styles if not already present
  function injectConsentStyles() {
    if (document.getElementById('jadomi-consent-css')) return;
    var style = document.createElement('style');
    style.id = 'jadomi-consent-css';
    style.textContent = [
      '.jpc-modal-bg{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px);}',
      '.jpc-modal{background:#1e1e2e;color:#fff;border-radius:16px;width:100%;max-width:440px;overflow:hidden;animation:jpcFadeIn .2s ease-out;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
      '@keyframes jpcFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}',
      '.jpc-header{padding:20px 24px 0;display:flex;align-items:center;gap:12px;}',
      '.jpc-header-icon{width:44px;height:44px;border-radius:12px;background:rgba(0,229,255,.12);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}',
      '.jpc-header h3{margin:0;font-size:17px;font-weight:600;}',
      '.jpc-body{padding:20px 24px;}',
      '.jpc-recipient{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:16px;}',
      '.jpc-recipient strong{color:#00e5ff;}',
      '.jpc-check-label{display:flex;align-items:flex-start;gap:12px;cursor:pointer;font-size:14px;line-height:1.5;margin-bottom:14px;user-select:none;}',
      '.jpc-check-label input[type=checkbox]{width:22px;height:22px;flex-shrink:0;margin-top:1px;accent-color:#00e5ff;cursor:pointer;}',
      '.jpc-rgpd{font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;margin-top:4px;}',
      '.jpc-actions{display:flex;gap:10px;padding:0 24px 24px;}',
      '.jpc-btn-accept{flex:1;padding:13px;border:none;border-radius:10px;background:#00e5ff;color:#000;font-weight:600;font-size:15px;cursor:pointer;transition:opacity .15s;}',
      '.jpc-btn-accept:disabled{opacity:.35;cursor:not-allowed;}',
      '.jpc-btn-decline{flex:1;padding:13px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:transparent;color:#fff;font-size:15px;cursor:pointer;transition:background .15s;}',
      '.jpc-btn-decline:hover{background:rgba(255,255,255,.06);}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Recipient labels
  var RECIPIENT_LABELS = {
    praticien: 'votre praticien',
    laboratoire: 'le laboratoire',
    patient: 'le patient',
    equipe: 'l\'equipe soignante',
    assurance: 'l\'organisme d\'assurance'
  };

  // Photo type labels
  var PHOTO_TYPE_LABELS = {
    teinte: 'Photo teinte',
    clinique: 'Photo clinique',
    urgence: 'Photo urgence',
    plaie: 'Photo plaie',
    suivi: 'Photo de suivi',
    essayage: 'Photo essayage',
    fabrication: 'Photo fabrication',
    visage: 'Photo visage',
    intra_oral: 'Photo intra-orale',
    autre: 'Photo'
  };

  /**
   * Show consent dialog before sharing a photo.
   * @param {string} photoType - Type of photo (teinte, clinique, etc.)
   * @param {string} recipientType - Who receives the photo (praticien, laboratoire, etc.)
   * @returns {Promise<{consented: boolean, timestamp: string, photoType: string, recipientType: string}>}
   */
  function requestPhotoConsent(photoType, recipientType) {
    injectConsentStyles();

    var recipientLabel = RECIPIENT_LABELS[recipientType] || recipientType || 'le destinataire';
    var photoLabel = PHOTO_TYPE_LABELS[photoType] || photoType || 'Photo';

    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'jpc-modal-bg';

      var modal = document.createElement('div');
      modal.className = 'jpc-modal';

      // Header
      var header = document.createElement('div');
      header.className = 'jpc-header';
      header.innerHTML = '<div class="jpc-header-icon">\uD83D\uDD12</div><h3>Consentement au partage</h3>';
      modal.appendChild(header);

      // Body
      var body = document.createElement('div');
      body.className = 'jpc-body';

      // Recipient info
      var recipientBox = document.createElement('div');
      recipientBox.className = 'jpc-recipient';
      recipientBox.innerHTML = 'Cette <strong>' + escapeHtml(photoLabel.toLowerCase()) + '</strong> sera partagee avec <strong>' + escapeHtml(recipientLabel) + '</strong>.';
      body.appendChild(recipientBox);

      // Checkbox
      var checkLabel = document.createElement('label');
      checkLabel.className = 'jpc-check-label';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkLabel.appendChild(checkbox);
      var checkText = document.createElement('span');
      checkText.textContent = 'J\'accepte le partage de cette image medicale dans le cadre de ma prise en charge.';
      checkLabel.appendChild(checkText);
      body.appendChild(checkLabel);

      // RGPD text
      var rgpd = document.createElement('div');
      rgpd.className = 'jpc-rgpd';
      rgpd.textContent = 'Conformement au RGPD (Reglement General sur la Protection des Donnees), vos donnees medicales sont traitees de maniere securisee. Vous pouvez a tout moment demander l\'acces, la rectification ou la suppression de vos images medicales en contactant votre praticien ou en ecrivant a contact@jadomi.fr.';
      body.appendChild(rgpd);

      modal.appendChild(body);

      // Actions
      var actions = document.createElement('div');
      actions.className = 'jpc-actions';

      var btnDecline = document.createElement('button');
      btnDecline.className = 'jpc-btn-decline';
      btnDecline.textContent = 'Refuser';
      btnDecline.addEventListener('click', function () {
        bg.remove();
        resolve({ consented: false, timestamp: new Date().toISOString(), photoType: photoType, recipientType: recipientType });
      });

      var btnAccept = document.createElement('button');
      btnAccept.className = 'jpc-btn-accept';
      btnAccept.textContent = 'Accepter et partager';
      btnAccept.disabled = true;

      checkbox.addEventListener('change', function () {
        btnAccept.disabled = !checkbox.checked;
      });

      btnAccept.addEventListener('click', function () {
        if (!checkbox.checked) return;
        var consentData = {
          consented: true,
          timestamp: new Date().toISOString(),
          photoType: photoType,
          recipientType: recipientType
        };
        // Store locally for audit trail
        storeConsentRecord(consentData);
        bg.remove();
        resolve(consentData);
      });

      actions.appendChild(btnDecline);
      actions.appendChild(btnAccept);
      modal.appendChild(actions);

      bg.appendChild(modal);

      // Click outside to decline
      bg.addEventListener('click', function (e) {
        if (e.target === bg) {
          bg.remove();
          resolve({ consented: false, timestamp: new Date().toISOString(), photoType: photoType, recipientType: recipientType });
        }
      });

      document.body.appendChild(bg);
    });
  }

  /**
   * Log consent for audit purposes.
   * @param {string} photoId - Unique identifier of the photo
   * @param {string} patientId - Patient identifier
   * @param {string} consentType - Type of consent given
   * @returns {object} The stored consent record
   */
  function logPhotoConsent(photoId, patientId, consentType) {
    var record = {
      id: generateId(),
      photoId: photoId,
      patientId: patientId,
      consentType: consentType,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    storeConsentRecord(record);
    return record;
  }

  /**
   * Retrieve all consent records from local storage.
   * @returns {Array} Array of consent records
   */
  function getConsentLog() {
    try {
      return JSON.parse(localStorage.getItem('jadomi_consent_log') || '[]');
    } catch (e) {
      return [];
    }
  }

  /**
   * Export consent log as JSON (for compliance / audit).
   * @returns {string} JSON string of all consent records
   */
  function exportConsentLog() {
    return JSON.stringify(getConsentLog(), null, 2);
  }

  /**
   * Clear consent log (admin action, should require confirmation).
   */
  function clearConsentLog() {
    localStorage.removeItem('jadomi_consent_log');
  }

  // ─── Internal helpers ───

  function storeConsentRecord(record) {
    try {
      var log = getConsentLog();
      log.push(record);
      // Keep last 500 records max locally
      if (log.length > 500) log = log.slice(-500);
      localStorage.setItem('jadomi_consent_log', JSON.stringify(log));
    } catch (e) {
      console.warn('[JADOMI Consent] Storage error:', e);
    }
  }

  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Export namespace ───

  window.JADOMI_PHOTO_CONSENT = {
    requestPhotoConsent: requestPhotoConsent,
    logPhotoConsent: logPhotoConsent,
    getConsentLog: getConsentLog,
    exportConsentLog: exportConsentLog,
    clearConsentLog: clearConsentLog
  };

})();
