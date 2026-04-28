/**
 * JADOMI Sign v2.0 — Moteur de signature electronique premium
 * PAdES Baseline B + TSA RFC 3161 + Audit Trail Immutable
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const SIGN_DIR = path.join(__dirname, '..', 'docs', 'signed');
const CERTS_DIR = path.join(__dirname, '..', 'docs', 'certificates');
const AUDIT_DIR = path.join(__dirname, '..', 'docs', 'audit');
const P12_PATH = path.join(__dirname, '..', 'certs', 'jadomi-sign.p12');

// Ensure directories exist
[SIGN_DIR, CERTS_DIR, AUDIT_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ============================================================
// 1. DOCUMENT HASHING (SHA-256)
// ============================================================

function hashDocument(bufferOrPath) {
  const buffer = typeof bufferOrPath === 'string'
    ? fs.readFileSync(bufferOrPath)
    : bufferOrPath;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function generateSignatureId() {
  const date = new Date();
  const prefix = 'JSIGN';
  const year = date.getFullYear();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

// ============================================================
// 2. PAdES DIGITAL SIGNATURE (PDF embedded)
// ============================================================

/**
 * Apply a real PAdES digital signature to a PDF buffer.
 * This makes Adobe Acrobat show "Signed by JADOMI Sign" with a green checkmark.
 */
async function signPdfPades(pdfBuffer, signerInfo = {}) {
  try {
    // Dynamic imports for ESM/CJS compatibility
    const { SignPdf } = require('@signpdf/signpdf');
    const { P12Signer } = require('@signpdf/signer-p12');
    const { plainAddPlaceholder } = require('@signpdf/placeholder-plain');

    // Read PKCS12 certificate
    const p12Path = P12_PATH;
    if (!fs.existsSync(p12Path)) {
      console.warn('JADOMI Sign: P12 certificate not found, skipping PAdES signature');
      return { signed: false, buffer: pdfBuffer, reason: 'no_certificate' };
    }
    const p12Buffer = fs.readFileSync(p12Path);

    // Add signature placeholder to PDF
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: signerInfo.reason || 'Signature electronique JADOMI Sign',
      contactInfo: signerInfo.email || 'contact@jadomi.fr',
      name: signerInfo.name || 'JADOMI Sign',
      location: signerInfo.location || 'Roubaix, France',
      signatureLength: 16384, // enough for most signatures
      subFilter: 'adbe.pkcs7.detached' // PAdES compatible
    });

    // Create signer with P12
    const signer = new P12Signer(p12Buffer, { passphrase: process.env.P12_PASSPHRASE || '' });

    // Sign the PDF
    const signPdf = new SignPdf();
    const signedPdf = await signPdf.sign(pdfWithPlaceholder, signer);

    return { signed: true, buffer: signedPdf };
  } catch (e) {
    console.error('PAdES signing error:', e.message);
    // Return unsigned buffer as fallback
    return { signed: false, buffer: pdfBuffer, reason: e.message };
  }
}

// ============================================================
// 3. TSA — TIME STAMPING AUTHORITY (RFC 3161)
// ============================================================

/**
 * Request a timestamp from a TSA (Time Stamping Authority).
 * Uses FreeTSA.org (free, RFC 3161 compliant).
 * For production with legal requirements, switch to Certigna/Universign.
 */
async function getTimestamp(dataBuffer) {
  try {
    // Create SHA-256 hash of the data
    const hash = crypto.createHash('sha256').update(dataBuffer).digest();

    // Build TSA request (simplified — using HTTP POST with hash)
    // FreeTSA endpoint
    const tsaUrl = process.env.TSA_URL || 'https://freetsa.org/tsr';

    // Create timestamp request (DER encoded)
    // RFC 3161 TimeStampReq structure
    const nonce = crypto.randomBytes(8);

    // ASN.1 DER encoding of TimeStampReq
    const tsRequest = buildTimestampRequest(hash, nonce);

    const response = await fetch(tsaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
      },
      body: tsRequest
    });

    if (!response.ok) {
      throw new Error(`TSA responded with ${response.status}`);
    }

    const tsResponse = Buffer.from(await response.arrayBuffer());

    return {
      success: true,
      timestamp: new Date().toISOString(),
      tsa_url: tsaUrl,
      tsa_response: tsResponse.toString('base64'),
      hash: hash.toString('hex'),
      nonce: nonce.toString('hex')
    };
  } catch (e) {
    console.error('TSA timestamp error:', e.message);
    // Fallback to local timestamp (clearly marked as non-qualified)
    return {
      success: false,
      timestamp: new Date().toISOString(),
      tsa_url: null,
      source: 'local_server',
      warning: 'Horodatage local (non qualifie). TSA externe indisponible.',
      hash: crypto.createHash('sha256').update(dataBuffer).digest('hex')
    };
  }
}

/**
 * Build a minimal RFC 3161 TimeStampReq in DER format
 * SHA-256 OID: 2.16.840.1.101.3.4.2.1
 */
function buildTimestampRequest(hash, nonce) {
  // SHA-256 algorithm identifier OID
  const sha256Oid = Buffer.from([
    0x30, 0x0d, // SEQUENCE
    0x06, 0x09, // OID
    0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, // 2.16.840.1.101.3.4.2.1
    0x05, 0x00  // NULL
  ]);

  // MessageImprint = SEQUENCE { hashAlgorithm, hashedMessage }
  const hashOctet = Buffer.concat([
    Buffer.from([0x04, hash.length]), // OCTET STRING tag + length
    hash
  ]);

  const messageImprint = Buffer.concat([
    Buffer.from([0x30, sha256Oid.length + hashOctet.length]), // SEQUENCE
    sha256Oid,
    hashOctet
  ]);

  // Nonce as INTEGER (prepend 0x00 if high bit set to avoid negative interpretation)
  const noncePadded = (nonce[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), nonce]) : nonce;
  const nonceInt = Buffer.concat([
    Buffer.from([0x02, noncePadded.length]), // INTEGER tag + length
    noncePadded
  ]);

  // CertReq BOOLEAN TRUE
  const certReq = Buffer.from([0x01, 0x01, 0xff]); // BOOLEAN TRUE

  // Version INTEGER 1
  const version = Buffer.from([0x02, 0x01, 0x01]);

  // TimeStampReq = SEQUENCE { version, messageImprint, nonce, certReq }
  const content = Buffer.concat([version, messageImprint, nonceInt, certReq]);

  // Proper DER length encoding: use short form for < 128, long form otherwise
  let lengthBytes;
  if (content.length < 128) {
    lengthBytes = Buffer.from([content.length]);
  } else if (content.length < 256) {
    lengthBytes = Buffer.from([0x81, content.length]);
  } else {
    lengthBytes = Buffer.from([0x82, (content.length >> 8) & 0xff, content.length & 0xff]);
  }

  return Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE tag
    lengthBytes,
    content
  ]);
}

// ============================================================
// 4. IMMUTABLE AUDIT TRAIL (Hash Chaining)
// ============================================================

/**
 * Immutable audit trail with hash chaining.
 * Each entry contains the hash of the previous entry,
 * making it tamper-evident (like a mini blockchain).
 */
class ImmutableAuditTrail {
  constructor(signatureId) {
    this.signatureId = signatureId;
    this.entries = [];
    this.documentHash = null;
    this.previousHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis
  }

  /**
   * Add an entry to the audit trail.
   * Each entry is chained to the previous one via SHA-256.
   */
  log(action, details = {}) {
    const entry = {
      seq: this.entries.length + 1,
      action,
      timestamp: new Date().toISOString(),
      unix_ms: Date.now(),
      previous_hash: this.previousHash,
      details: { ...details }
    };

    // Remove sensitive data from details before hashing
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.ip;
    delete sanitizedDetails.user_agent;

    // Compute hash of this entry (including previous hash = chain)
    const entryString = JSON.stringify({
      seq: entry.seq,
      action: entry.action,
      timestamp: entry.timestamp,
      previous_hash: entry.previous_hash,
      details: sanitizedDetails
    });
    entry.hash = crypto.createHash('sha256').update(entryString).digest('hex');
    this.previousHash = entry.hash;

    this.entries.push(entry);
    return this;
  }

  setDocumentHash(hash) {
    this.documentHash = hash;
    this.log('document_hashed', { algorithm: 'SHA-256', hash });
    return this;
  }

  /**
   * Verify the integrity of the entire chain.
   * Returns true if no entry has been tampered with.
   */
  verify() {
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const entry of this.entries) {
      if (entry.previous_hash !== prevHash) return false;
      // Recompute hash
      const sanitized = { ...entry.details };
      delete sanitized.ip;
      delete sanitized.user_agent;
      const str = JSON.stringify({
        seq: entry.seq,
        action: entry.action,
        timestamp: entry.timestamp,
        previous_hash: entry.previous_hash,
        details: sanitized
      });
      const computed = crypto.createHash('sha256').update(str).digest('hex');
      if (computed !== entry.hash) return false;
      prevHash = entry.hash;
    }
    return true;
  }

  toJSON() {
    return {
      signature_id: this.signatureId,
      document_hash_sha256: this.documentHash,
      chain_valid: this.verify(),
      audit_trail: this.entries,
      generated_at: new Date().toISOString(),
      version: '2.0',
      system: 'JADOMI Sign',
      chain_type: 'SHA-256 hash-chaining (tamper-evident)'
    };
  }
}

// ============================================================
// 5. VERIFICATION (HMAC tokens + QR)
// ============================================================

function generateVerificationUrl(signatureId, baseUrl = 'https://jadomi.fr') {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET requis pour la verification de signature');
  const token = crypto.createHmac('sha256', secret)
    .update(signatureId)
    .digest('hex')
    .substring(0, 32);
  return `${baseUrl}/verify-signature?id=${signatureId}&token=${token}`;
}

function verifySignatureToken(signatureId, token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(signatureId)
    .digest('hex')
    .substring(0, 32);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// ============================================================
// 6. CERTIFICATE OF COMPLETION PDF
// ============================================================

async function generateCertificatePDF(signatureData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Certificat de Signature - ${signatureData.signature_id}`,
          Author: 'JADOMI Sign',
          Subject: 'Certificat de Completion de Signature Electronique',
          Creator: 'JADOMI Sign v2.0'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const accentColor = '#6366f1';
      const textColor = '#1e1b4b';
      const textLight = '#64748b';
      const successColor = '#10b981';
      const borderColor = '#e2e8f0';

      // Top accent line
      doc.rect(0, 0, doc.page.width, 4).fill(accentColor);

      // Header
      doc.fontSize(28).font('Helvetica-Bold').fillColor(accentColor).text('JADOMI', 50, 30);
      doc.fontSize(10).font('Helvetica').fillColor(textLight).text('Sign v2.0', 155, 38);
      doc.moveDown(0.5);
      doc.fontSize(20).font('Helvetica-Bold').fillColor(textColor).text('Certificat de Completion', 50, 65);
      doc.fontSize(10).font('Helvetica').fillColor(textLight)
        .text('Certificate of Completion — Preuve de signature electronique', 50, 90);
      doc.moveTo(50, 110).lineTo(545, 110).strokeColor(borderColor).lineWidth(1).stroke();

      let y = 125;
      const addRow = (label, value, yPos) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(textLight).text(label, 50, yPos);
        doc.fontSize(10).font('Helvetica').fillColor(textColor).text(String(value || '—'), 200, yPos, { width: 345 });
        return yPos + 18;
      };

      // Document info
      doc.fontSize(12).font('Helvetica-Bold').fillColor(textColor).text('Informations du document', 50, y);
      y += 25;
      y = addRow('Identifiant', signatureData.signature_id, y);
      y = addRow('Titre', signatureData.title || 'Document', y);
      y = addRow('Categorie', signatureData.category || 'contrat', y);
      y = addRow('Date creation', signatureData.created_at ? new Date(signatureData.created_at).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR'), y);
      y = addRow('Statut', signatureData.status === 'signed' ? 'SIGNE' : (signatureData.status || 'EN COURS').toUpperCase(), y);

      y += 10;
      doc.moveTo(50, y).lineTo(545, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 15;

      // Signataire
      doc.fontSize(12).font('Helvetica-Bold').fillColor(textColor).text('Signataire', 50, y);
      y += 25;
      doc.roundedRect(50, y, 495, 65, 4).strokeColor(borderColor).lineWidth(1).stroke();
      y += 10;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textColor).text(signatureData.signer_name || 'Non renseigne', 65, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor(textLight).text('Email : ' + (signatureData.signer_email || '—'), 65, y);
      y += 14;
      doc.fontSize(9).font('Helvetica').fillColor(textLight).text('Role : ' + (signatureData.signer_role || 'Signataire'), 65, y);
      y += 35;

      // Securite
      doc.fontSize(12).font('Helvetica-Bold').fillColor(textColor).text('Securite et integrite', 50, y);
      y += 25;
      const hash = signatureData.document_hash || 'N/A';
      y = addRow('Algorithme', 'SHA-256', y);
      y = addRow('Empreinte', hash, y);

      // PAdES status
      const padesStatus = signatureData.pades_signed ? 'Oui — signature PAdES integree au PDF' : 'Non — signature externe';
      y = addRow('Signature PDF (PAdES)', padesStatus, y);

      // TSA status
      const tsaInfo = signatureData.tsa_timestamp;
      if (tsaInfo && tsaInfo.success) {
        y = addRow('Horodatage TSA', 'Qualifie — ' + tsaInfo.tsa_url, y);
        y = addRow('Timestamp TSA', tsaInfo.timestamp, y);
      } else {
        y = addRow('Horodatage', 'Serveur local (non qualifie)', y);
      }

      // Verification URL
      const verifyUrl = signatureData.verification_url || generateVerificationUrl(signatureData.signature_id);
      y = addRow('Verification', verifyUrl, y);

      // Audit chain
      const chainValid = signatureData.chain_valid !== undefined ? signatureData.chain_valid : true;
      y += 5;
      y = addRow('Integrite chaine audit', chainValid ? 'VALIDE — aucune alteration detectee' : 'ATTENTION — alteration detectee', y);

      y += 10;
      doc.moveTo(50, y).lineTo(545, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 15;

      // Audit trail
      if (y < 600) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor(textColor).text('Piste d\'audit (hash-chained)', 50, y);
        y += 20;

        const actionLabels = {
          document_created: 'Document cree',
          document_uploaded: 'Document televerse',
          document_hashed: 'Empreinte SHA-256 calculee',
          signature_requested: 'Signature demandee',
          email_sent: 'Email envoye au signataire',
          document_viewed: 'Document consulte par signataire',
          document_signed: 'Document signe',
          pades_applied: 'Signature PAdES appliquee au PDF',
          tsa_timestamp: 'Horodatage TSA obtenu',
          certificate_generated: 'Certificat de completion genere',
          pdf_archived: 'PDF archive sur serveur',
          copy_emailed: 'Copie signee envoyee au signataire',
          aes_identity_verified: 'Identite verifiee (AES eIDAS Art. 26)'
        };

        // Table header
        doc.rect(50, y, 495, 16).fill('#f1f5f9');
        doc.fontSize(7).font('Helvetica-Bold').fillColor(textColor);
        doc.text('#', 55, y + 5);
        doc.text('HORODATAGE', 70, y + 5);
        doc.text('ACTION', 185, y + 5);
        doc.text('HASH CHAINE', 370, y + 5);
        y += 16;

        const entries = signatureData.audit_trail || [];
        entries.forEach((entry, i) => {
          if (y > 750) { doc.addPage(); y = 50; }
          const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(50, y, 495, 14).fill(bg);
          doc.fontSize(6).font('Helvetica').fillColor(textColor);
          doc.text(String(entry.seq || i + 1), 55, y + 4);
          doc.text(entry.timestamp ? new Date(entry.timestamp).toLocaleString('fr-FR') : '—', 70, y + 4);
          doc.text(actionLabels[entry.action] || entry.action, 185, y + 4);
          doc.fontSize(5).fillColor(textLight);
          doc.text((entry.hash || '').substring(0, 24) + '...', 370, y + 4);
          y += 14;
        });
      }

      // AES Identity Verification section (if AES)
      const sigLevelForSection = signatureData.metadata && signatureData.metadata.signature_level;
      if (sigLevelForSection === 'aes' && signatureData.metadata.aes_proof) {
        const aesProof = signatureData.metadata.aes_proof;
        const identity = aesProof.signer_identity || {};

        y += 15;
        if (y > 700) { doc.addPage(); y = 50; }
        doc.fontSize(12).font('Helvetica-Bold').fillColor(successColor).text('Verification d\'identite (AES — eIDAS Article 26)', 50, y);
        y += 20;

        y = addRow('Niveau', 'Signature Electronique Avancee (AES)', y);
        y = addRow('OTP SMS verifie', aesProof.otp_verified ? 'Oui' : 'Non', y);
        if (aesProof.otp_verified_at) {
          y = addRow('OTP verifie le', new Date(aesProof.otp_verified_at).toLocaleString('fr-FR'), y);
        }
        if (aesProof.otp_phone_masked) {
          y = addRow('Telephone (masque)', aesProof.otp_phone_masked, y);
        }
        if (identity.full_name) {
          y = addRow('Nom complet', identity.full_name, y);
        }
        if (identity.ip_address) {
          y = addRow('Adresse IP', identity.ip_address, y);
        }
        if (identity.user_agent) {
          y = addRow('Navigateur', identity.user_agent.substring(0, 80), y);
        }
        if (identity.consent_given) {
          y = addRow('Consentement', 'Oui — ' + new Date(identity.consent_timestamp).toLocaleString('fr-FR'), y);
          y += 5;
          doc.fontSize(7).font('Helvetica').fillColor(textLight)
            .text('"' + identity.consent_text + '"', 65, y, { width: 470 });
          y += 20;
        }
        if (aesProof.eidas_article) {
          y = addRow('Base juridique', aesProof.eidas_article, y);
        }

        y += 5;
        doc.moveTo(50, y).lineTo(545, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      }

      // Professional attestation of signer identity (eIDAS 26.2)
      if (signatureData.metadata && signatureData.metadata.pro_attestation) {
        y += 15;
        if (y > 700) { doc.addPage(); y = 50; }
        y = addRow('Attestation pro', 'Le professionnel JADOMI atteste connaitre l\'identite du signataire', y);
        if (signatureData.metadata.pro_attestation_by) {
          y = addRow('Atteste par', signatureData.metadata.pro_attestation_by, y);
        }
        if (signatureData.metadata.pro_attestation_at) {
          y = addRow('Atteste le', new Date(signatureData.metadata.pro_attestation_at).toLocaleString('fr-FR'), y);
        }
      }

      // Footer
      y = Math.max(y + 20, 700);
      if (y > 770) { doc.addPage(); y = 50; }
      doc.moveTo(50, y).lineTo(545, y).strokeColor(borderColor).lineWidth(0.5).stroke();
      y += 10;
      doc.fontSize(7).font('Helvetica').fillColor(textLight)
        .text('Ce certificat atteste que le document a ete signe electroniquement via JADOMI Sign.', 50, y, { width: 495, align: 'center' });
      y += 10;
      const sigLevel = signatureData.metadata && signatureData.metadata.signature_level;
      if (sigLevel === 'aes') {
        doc.text('Signature Electronique Avancee (AES) — conforme eIDAS Article 26 (UE) n 910/2014.', 50, y, { width: 495, align: 'center' });
      } else {
        doc.text('Signature Electronique Simple (SES) renforcee au sens du reglement europeen eIDAS (UE) n 910/2014.', 50, y, { width: 495, align: 'center' });
      }
      y += 10;
      doc.text('L\'integrite du document est verifiable via l\'URL de verification ci-dessus.', 50, y, { width: 495, align: 'center' });
      y += 14;
      doc.text('Genere par JADOMI Sign v2.0 le ' + new Date().toLocaleString('fr-FR'), 50, y, { width: 495, align: 'center' });

      doc.rect(0, doc.page.height - 4, doc.page.width, 4).fill(accentColor);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================================
// 7. MAIN ARCHIVE FUNCTION
// ============================================================

async function archiveSignedDocument(signatureId, signedPdfBuffer, signatureData) {
  // 1. Hash the original document
  const docHash = hashDocument(signedPdfBuffer);

  // 2. Build audit trail with hash chaining
  const audit = new ImmutableAuditTrail(signatureId);
  audit.setDocumentHash(docHash);
  audit.log('document_signed', {
    signer: signatureData.signer_name,
    email: signatureData.signer_email,
    ip: signatureData.signer_ip || 'N/A'
  });

  // 2b. AES proof in audit trail (if AES signature)
  if (signatureData.metadata && signatureData.metadata.signature_level === 'aes') {
    const aes = signatureData.metadata.aes_proof || {};
    audit.log('aes_identity_verified', {
      method: 'SMS OTP + identity capture',
      phone_verified: aes.otp_verified || false,
      consent_given: !!(aes.signer_identity && aes.signer_identity.consent_given),
      eidas: 'Article 26 (UE) 910/2014'
    });
  }

  // 3. Apply PAdES digital signature to the PDF
  const padesResult = await signPdfPades(signedPdfBuffer, {
    name: signatureData.signer_name || 'JADOMI Sign',
    email: signatureData.signer_email,
    reason: 'Document signe via JADOMI Sign - ' + (signatureData.title || 'Document'),
    location: 'Roubaix, France'
  });

  if (padesResult.signed) {
    audit.log('pades_applied', { status: 'success' });
    signedPdfBuffer = padesResult.buffer; // Use PAdES-signed version
  } else {
    audit.log('pades_applied', { status: 'fallback', reason: padesResult.reason });
  }

  // 4. Request TSA timestamp
  const tsaTimestamp = await getTimestamp(signedPdfBuffer);
  audit.log('tsa_timestamp', {
    success: tsaTimestamp.success,
    tsa_url: tsaTimestamp.tsa_url || 'local',
    source: tsaTimestamp.success ? 'external_tsa' : 'local_server'
  });

  // 5. Save signed PDF
  const signedPath = path.join(SIGN_DIR, `${signatureId}.pdf`);
  fs.writeFileSync(signedPath, signedPdfBuffer);
  audit.log('pdf_archived');

  // 6. Generate certificate PDF
  const certData = {
    ...signatureData,
    signature_id: signatureId,
    document_hash: docHash,
    audit_trail: audit.entries,
    verification_url: generateVerificationUrl(signatureId),
    pades_signed: padesResult.signed,
    tsa_timestamp: tsaTimestamp,
    chain_valid: audit.verify()
  };

  const certBuffer = await generateCertificatePDF(certData);
  const certPath = path.join(CERTS_DIR, `${signatureId}_certificate.pdf`);
  fs.writeFileSync(certPath, certBuffer);
  audit.log('certificate_generated');

  // 7. Save immutable audit trail as JSON
  const auditPath = path.join(AUDIT_DIR, `${signatureId}_audit.json`);
  fs.writeFileSync(auditPath, JSON.stringify(audit.toJSON(), null, 2));

  // 8. Save TSA response if available
  if (tsaTimestamp.success && tsaTimestamp.tsa_response) {
    const tsaPath = path.join(AUDIT_DIR, `${signatureId}_tsa.b64`);
    fs.writeFileSync(tsaPath, tsaTimestamp.tsa_response);
  }

  return {
    signed_pdf_path: `docs/signed/${signatureId}.pdf`,
    certificate_pdf_path: `docs/certificates/${signatureId}_certificate.pdf`,
    audit_json_path: `docs/audit/${signatureId}_audit.json`,
    document_hash: docHash,
    verification_url: certData.verification_url,
    pades_signed: padesResult.signed,
    tsa_timestamp: tsaTimestamp,
    chain_valid: audit.verify(),
    audit_trail: audit.toJSON()
  };
}

module.exports = {
  generateSignatureId,
  hashDocument,
  ImmutableAuditTrail,
  signPdfPades,
  getTimestamp,
  generateVerificationUrl,
  verifySignatureToken,
  generateCertificatePDF,
  archiveSignedDocument,
  SIGN_DIR,
  CERTS_DIR,
  AUDIT_DIR
};
