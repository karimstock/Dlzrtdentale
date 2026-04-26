// Script : Envoyer les dossiers JADOMI par email
const fs = require('fs');
const { sendMail } = require('../api/multiSocietes/mailer');

async function main() {
  const dossierAvocat = fs.readFileSync(__dirname + '/../docs/DOSSIER-AVOCAT-JADOMI.html');
  const businessPlan = fs.readFileSync(__dirname + '/../docs/business-plan-jadomi.html');

  const attachments = [
    { filename: 'DOSSIER-AVOCAT-JADOMI.html', content: dossierAvocat, contentType: 'text/html' },
    { filename: 'BUSINESS-PLAN-JADOMI.html', content: businessPlan, contentType: 'text/html' },
  ];

  // Version complementaire si elle existe
  try {
    const v2 = fs.readFileSync(__dirname + '/../docs/dossier-avocat-jadomi.html');
    attachments.push({ filename: 'dossier-avocat-jadomi-v2.html', content: v2, contentType: 'text/html' });
  } catch (e) {}

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:30px;">
    <div style="font-size:36px;font-weight:800;color:#10b981;">JADOMI</div>
    <div style="color:#64748b;font-size:14px;">Plateforme d'achats intelligente</div>
  </div>

  <h2 style="color:#0f172a;border-bottom:2px solid #10b981;padding-bottom:8px;">Vos documents sont prets</h2>

  <p>Bonjour Karim,</p>
  <p>Voici les documents prepares pour votre rendez-vous avocat et votre dossier banque :</p>

  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="font-weight:700;color:#065f46;margin-bottom:8px;">Documents joints :</p>
    <ul style="color:#334155;">
      <li><strong>DOSSIER-AVOCAT-JADOMI.html</strong> — Dossier juridique complet (15 questions, CGV, mandat facturation, RGPD, PI, checklist)</li>
      <li><strong>BUSINESS-PLAN-JADOMI.html</strong> — Business plan banque (etude de marche, projections 3 ans, modele economique)</li>
      <li><strong>dossier-avocat-jadomi-v2.html</strong> — Version complementaire du dossier avocat</li>
    </ul>
  </div>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="font-weight:700;color:#0f172a;margin-bottom:8px;">Comment utiliser ces documents :</p>
    <ul style="color:#334155;font-size:13px;">
      <li>Ouvrez les fichiers .html dans votre navigateur pour les consulter</li>
      <li>Imprimez-les en A4 (mise en page optimisee pour l'impression)</li>
      <li>Ouvrez-les dans Word pour les modifier (remplacez les XXXX par vos infos)</li>
      <li>Ces documents seront enrichis a chaque passe de developpement</li>
    </ul>
  </div>

  <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="font-weight:700;color:#92400e;margin-bottom:4px;">Bilan session Passes 52-54 :</p>
    <p style="color:#78350f;font-size:13px;">
      3 passes livrees en une session.<br>
      30 agents deployes (15 builders + 15 reviewers). 57 bugs corriges.<br>
      JADOMI Compare (economies, benchmark, alertes prix).<br>
      GPO avec revelation post-acceptation + prix verrouille.<br>
      Facturation Factur-X conforme EN 16931 + mandat art. 289 CGI.<br>
      Contrat mandat pret. Page signature fournisseur en ligne.
    </p>
  </div>

  <div style="text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;">
    <div style="font-size:12px;color:#94a3b8;">JADOMI — Plateforme d'achats intelligente pour professionnels de sante</div>
    <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Document genere automatiquement — Avril 2026</div>
  </div>
</div>`;

  const result = await sendMail({
    to: 'karim_bahmed@yahoo.fr',
    subject: 'JADOMI — Dossier Avocat + Business Plan (Passes 52-54)',
    html,
    attachments
  });

  console.log('Resultat envoi:', JSON.stringify(result, null, 2));
}

main().catch(e => console.error('Erreur:', e.message));
