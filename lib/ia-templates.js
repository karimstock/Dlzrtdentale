// =============================================
// JADOMI — Templates documents dentaires
// Génère les documents SANS appel API (0€)
// Les données viennent du Copilot (actes, dents, durée)
// =============================================

const TEMPLATES = {

  // ── CR CONSULTATION ──
  cr_consultation(data) {
    const { patient, date, praticien, actes, dents, notes, duree, prescriptions } = data;
    const actesTexte = (actes || []).map(a => {
      let t = a.label || a.acte;
      if (a.dents && a.dents.length) t += ' (dent' + (a.dents.length > 1 ? 's ' : ' ') + a.dents.join(', ') + ')';
      return '- ' + t;
    }).join('\n');

    return `COMPTE RENDU DE CONSULTATION

Patient : ${patient || '—'}
Date : ${date || new Date().toLocaleDateString('fr-FR')}
Praticien : ${praticien || 'Dr Bahmed'}
Durée de la séance : ${duree || '—'} minutes

MOTIF DE CONSULTATION
${notes || 'Consultation de routine'}

EXAMEN CLINIQUE
${actesTexte || '- Examen clinique complet'}

DENTS CONCERNÉES
${dents && dents.length ? dents.sort((a,b) => a-b).join(', ') + ' (notation FDI)' : 'Examen général'}

ACTES RÉALISÉS
${actesTexte || '- Bilan'}

${prescriptions ? 'PRESCRIPTIONS\n' + prescriptions + '\n' : ''}SUIVI
Prochain rendez-vous à prévoir selon le plan de traitement.

VÉRIFICATION OBLIGATOIRE PAR LE PRATICIEN
Ce document est un brouillon généré automatiquement.

${praticien || 'Dr Bahmed'}
${date || new Date().toLocaleDateString('fr-FR')}`;
  },

  // ── CR IMPLANT ──
  cr_implant(data) {
    const { patient, date, praticien, dent, implant, torque, isq, greffe, membrane, sutures, complications, prescriptions } = data;

    return `COMPTE RENDU OPÉRATOIRE — CHIRURGIE IMPLANTAIRE

Patient : ${patient || '—'}
Date : ${date || new Date().toLocaleDateString('fr-FR')}
Praticien : ${praticien || 'Dr Bahmed'}

SITE IMPLANTAIRE
Position : ${dent || '—'} (notation FDI)

PROTOCOLE CHIRURGICAL
1. Anesthésie : articaïne 4% + adrénaline 1/100 000
2. Incision : crestale
3. Décollement : lambeau pleine épaisseur
4. Forage séquentiel selon protocole fabricant
5. Classification osseuse : ${data.classification_os || 'D2'}

IMPLANT POSÉ
${implant || 'Référence à préciser'}
Torque d'insertion : ${torque || '—'} N.cm
Stabilité primaire (ISQ) : ${isq || '—'}

${greffe ? 'GREFFE OSSEUSE\nMatériau : ' + greffe + '\n' : ''}${membrane ? 'MEMBRANE\nType : ' + membrane + '\n' : ''}FERMETURE
Sutures : ${sutures || 'Vicryl 5-0, points simples'}

${complications ? 'COMPLICATIONS\n' + complications + '\n' : 'COMPLICATIONS\nAucune complication per-opératoire.\n'}
PRESCRIPTIONS POST-OPÉRATOIRES
${prescriptions || `- Amoxicilline 1g x 2/jour pendant 7 jours
- Ibuprofène 400mg si douleur (max 3/jour)
- Paracétamol 1g en alternance si besoin
- Bain de bouche chlorhexidine 0.12% à partir de J+1
- Glace 20 min/heure le jour même
- Alimentation molle 48h`}

SUIVI PRÉVU
- J+7 : dépose fils, contrôle cicatrisation
- J+15 : contrôle
- 3 mois : contrôle ostéointégration
- 4-6 mois : mise en charge, empreinte prothétique

VÉRIFICATION OBLIGATOIRE PAR LE PRATICIEN
Ce document est un brouillon généré automatiquement.

${praticien || 'Dr Bahmed'}
${date || new Date().toLocaleDateString('fr-FR')}`;
  },

  // ── CERTIFICAT MÉDICAL ──
  certificat_medical(data) {
    const { patient, date_naissance, date, praticien, motif, itt, observations } = data;

    return `CERTIFICAT MÉDICAL

Je soussigné, ${praticien || 'Dr Bahmed K.'}, chirurgien-dentiste,

Certifie avoir examiné ce jour ${patient || '—'}${date_naissance ? ', né(e) le ' + date_naissance : ''}.

${motif || 'Examen bucco-dentaire réalisé.'}

${observations ? 'OBSERVATIONS\n' + observations + '\n' : ''}${itt ? 'INCAPACITÉ TEMPORAIRE TOTALE\nDurée estimée : ' + itt + ' jours\n(sous réserve de complications)\n' : ''}
Ce certificat est établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.

Fait à Roubaix, le ${date || new Date().toLocaleDateString('fr-FR')}

${praticien || 'Dr Bahmed K.'}
Chirurgien-dentiste`;
  },

  // ── COURRIER CONFRÈRE ──
  courrier_confrere(data) {
    const { patient, date, praticien, destinataire, specialite, motif, observations, actes, dents } = data;

    return `${praticien || 'Dr Bahmed K.'}
Chirurgien-dentiste
Roubaix

${destinataire ? 'À l\'attention de ' + destinataire : 'Cher(e) Confrère/Consœur'}
${specialite ? specialite : ''}

Roubaix, le ${date || new Date().toLocaleDateString('fr-FR')}

Objet : ${motif || 'Avis spécialisé'}

Cher(e) Confrère/Consœur,

Je vous adresse ${patient || 'mon patient(e)'} pour ${motif || 'avis spécialisé'}.

${observations || 'Merci de bien vouloir examiner ce patient et me faire part de votre avis.'}

${actes && actes.length ? 'Actes réalisés :\n' + actes.map(a => '- ' + (a.label || a.acte)).join('\n') + '\n' : ''}${dents && dents.length ? 'Dents concernées : ' + dents.join(', ') + ' (FDI)\n' : ''}
Je reste à votre disposition pour tout renseignement complémentaire.

Confraternellement,

${praticien || 'Dr Bahmed K.'}`;
  },

  // ── ORDONNANCE ──
  ordonnance(data) {
    const { patient, date, praticien, prescriptions } = data;

    return `${praticien || 'Dr Bahmed K.'}
Chirurgien-dentiste
Roubaix

Le ${date || new Date().toLocaleDateString('fr-FR')}

Patient : ${patient || '—'}

ORDONNANCE

${prescriptions || `1. AMOXICILLINE 1g
   1 comprimé matin et soir pendant 7 jours
   [À PRÉCISER PAR LE PRATICIEN]

2. IBUPROFÈNE 400mg
   1 comprimé si douleur, maximum 3 par jour
   Au cours des repas

3. PARACÉTAMOL 1g
   1 comprimé en alternance avec l'ibuprofène si besoin
   Maximum 4 par jour

4. CHLORHEXIDINE 0.12% bain de bouche
   1 bain de bouche 2 fois par jour pendant 7 jours
   À partir du lendemain de l'intervention`}

VÉRIFICATION OBLIGATOIRE PAR LE PRATICIEN
Les dosages doivent être vérifiés et adaptés au patient.
NE JAMAIS délivrer une ordonnance sans vérification.

${praticien || 'Dr Bahmed K.'}`;
  },

  // ── DEVIS PATIENT ──
  devis_patient(data) {
    const { patient, date, praticien, actes, total } = data;
    let lignes = '';
    let totalCalc = 0;

    if (actes && actes.length) {
      lignes = actes.map((a, i) => {
        const prix = a.prix || 0;
        totalCalc += prix;
        return `${i+1}. ${a.label || a.acte}${a.dents && a.dents.length ? ' (dent ' + a.dents.join(', ') + ')' : ''} — ${prix > 0 ? prix.toFixed(2) + ' €' : 'À chiffrer'}`;
      }).join('\n');
    }

    return `DEVIS DENTAIRE

Patient : ${patient || '—'}
Date : ${date || new Date().toLocaleDateString('fr-FR')}
Praticien : ${praticien || 'Dr Bahmed K.'}

PLAN DE TRAITEMENT PROPOSÉ

${lignes || 'Actes à détailler'}

${totalCalc > 0 ? 'TOTAL : ' + totalCalc.toFixed(2) + ' €\n' : ''}
Reste à charge estimé : [à calculer selon mutuelle]
Base de remboursement Sécurité Sociale : [selon CCAM]

Ce devis est valable 3 mois.
Le patient reconnaît avoir été informé du plan de traitement.

Date : ${date || new Date().toLocaleDateString('fr-FR')}
Signature patient :                    Signature praticien :

${praticien || 'Dr Bahmed K.'}`;
  },

  // ── BON DE LABO ──
  bon_labo(data) {
    const { patient, date, praticien, prothesiste, travail, dents, teinte, materiau, observations } = data;

    return `BON DE TRAVAIL — LABORATOIRE DE PROTHÈSE

Date : ${date || new Date().toLocaleDateString('fr-FR')}
Praticien : ${praticien || 'Dr Bahmed K.'}
Laboratoire : ${prothesiste || '—'}

PATIENT
Nom : ${patient || '—'}

TRAVAIL DEMANDÉ
${travail || 'À préciser'}

Dents : ${dents && dents.length ? dents.join(', ') + ' (FDI)' : '—'}
Teinte : ${teinte || 'À déterminer'}
Matériau : ${materiau || 'Au choix du prothésiste'}

${observations ? 'OBSERVATIONS\n' + observations + '\n' : ''}
DATE DE LIVRAISON SOUHAITÉE : [à préciser]

${praticien || 'Dr Bahmed K.'}`;
  },

  // ── CONSENTEMENT ÉCLAIRÉ ──
  consentement_eclaire(data) {
    const { patient, date, praticien, acte, risques } = data;

    return `FORMULAIRE DE CONSENTEMENT ÉCLAIRÉ

Patient : ${patient || '—'}
Date : ${date || new Date().toLocaleDateString('fr-FR')}
Praticien : ${praticien || 'Dr Bahmed K.'}

ACTE PROPOSÉ
${acte || 'À préciser'}

INFORMATIONS
Le praticien m'a informé(e) de manière claire et complète sur :
- La nature de l'acte proposé
- Les bénéfices attendus
- Les risques et complications possibles
- Les alternatives thérapeutiques

${risques ? 'RISQUES SPÉCIFIQUES\n' + risques + '\n' : ''}
DÉCLARATION DU PATIENT
Je déclare avoir reçu une information claire et compréhensible.
J'ai pu poser toutes mes questions.
Je consens librement à la réalisation de cet acte.

VÉRIFICATION OBLIGATOIRE PAR LE PRATICIEN
Ce document est un brouillon. Adapter au cas clinique.

Date : ${date || new Date().toLocaleDateString('fr-FR')}
Signature patient :                    Signature praticien :`;
  },
};

// Générer un document depuis les données Copilot
function generateFromCopilot(type, copilotData) {
  const template = TEMPLATES[type];
  if (!template) return null;

  // Mapper les données Copilot vers le format attendu
  const data = {
    patient: copilotData.patient || copilotData.patient_nom || '',
    date: new Date().toLocaleDateString('fr-FR'),
    praticien: copilotData.praticien || 'Dr Bahmed K.',
    actes: copilotData.actes || copilotData.copilot_actes || [],
    dents: [],
    duree: copilotData.duree || copilotData.duree_minutes || null,
    notes: copilotData.notes || copilotData.copilot_transcript || '',
    prescriptions: copilotData.prescriptions || null,
    // Implant spécifique
    dent: copilotData.dent || null,
    implant: copilotData.implant || null,
    torque: copilotData.torque || null,
    isq: copilotData.isq || null,
    greffe: copilotData.greffe || null,
    membrane: copilotData.membrane || null,
    sutures: copilotData.sutures || null,
    complications: copilotData.complications || null,
  };

  // Extraire toutes les dents
  if (data.actes) {
    for (const a of data.actes) {
      if (a.dents) {
        for (const d of a.dents) {
          if (!data.dents.includes(d)) data.dents.push(d);
        }
      }
    }
  }

  return template(data);
}

module.exports = { TEMPLATES, generateFromCopilot };
