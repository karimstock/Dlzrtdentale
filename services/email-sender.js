// =============================================
// JADOMI LABO — Email Sender (OVH Email Pro)
// Rate limit : 50 emails/minute
// =============================================

const nodemailer = require('nodemailer');

let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro2.mail.ovh.net',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return _transporter;
}

// Envoi facture a un dentiste
async function envoyerFacture({ dentiste, facture, prothesiste, pdfBuffer }) {
  const transport = getTransporter();
  const nomDr = `${dentiste.titre || 'Dr'} ${dentiste.prenom || ''} ${dentiste.nom}`.trim();
  const moisAnnee = new Date(facture.periode_fin).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const info = await transport.sendMail({
    from: `"${prothesiste.raison_sociale}" <${process.env.SMTP_USER || 'noreply@jadomi.fr'}>`,
    to: dentiste.email,
    subject: `Facture ${facture.numero_facture} - ${moisAnnee}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${prothesiste.raison_sociale}</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour ${nomDr},</p>
          <p>Veuillez trouver en piece jointe votre facture pour la periode
          du ${new Date(facture.periode_debut).toLocaleDateString('fr-FR')}
          au ${new Date(facture.periode_fin).toLocaleDateString('fr-FR')}.</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Facture N° :</strong> ${facture.numero_facture}</p>
            <p style="margin: 5px 0;"><strong>Montant TTC :</strong> ${(Number(facture.total_ttc) || 0).toFixed(2).replace('.', ',')} EUR</p>
          </div>
          <p>Cordialement,<br>${prothesiste.raison_sociale}</p>
        </div>
      </div>
    `,
    attachments: [{
      filename: `Facture_${facture.numero_facture}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

// Envoi batch avec rate limiting (50/min)
async function envoyerFacturesBatch(envois) {
  const resultats = [];
  const RATE_LIMIT = 50;
  const DELAY_MS = 60000 / RATE_LIMIT; // 1200ms entre chaque

  for (let i = 0; i < envois.length; i++) {
    try {
      const result = await envoyerFacture(envois[i]);
      resultats.push({ success: true, email: envois[i].dentiste.email, ...result });
    } catch (e) {
      resultats.push({ success: false, email: envois[i].dentiste.email, error: e.message });
    }

    // Rate limit
    if (i < envois.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return resultats;
}

module.exports = { envoyerFacture, envoyerFacturesBatch };
